import type { CanUseTool, EffortLevel, PermissionMode, PermissionResult, PermissionUpdate, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { existsSync } from 'node:fs';
import { toolSummary } from './transcript';

/**
 * Runs Claude Code sessions from Lighthouse, under `npm run dev` only: resumes a session by its id with the Agent SDK,
 * sends your messages into it, and holds each permission request or question until you answer it on the page.
 * Resuming appends to the session's own transcript, so the page shows the reply by reading that file as usual.
 *
 * It runs on your Claude Code login: ANTHROPIC_API_KEY (in .env.local for the brief) and the other key variables are
 * kept out of the session's environment, so nothing is billed to an API key.
 */

export type Ask = {
    key: string;
    kind: 'permission' | 'question';
    tool: string;
    summary: string;
    input: string;
    questions: { question: string; header: string; multiSelect: boolean; options: { label: string; description: string }[] }[];
    canAlways: boolean;
};
/** How a run stands, how full its context is, and its settings. `used`: you sent something through it. */
export type RunView = {
    state: 'working' | 'idle' | 'ended'; error?: string; asks: Ask[]; used: boolean;
    context?: { tokens: number; max: number }; model?: string; effort?: EffortLevel; mode: string;
};
/** What the page offers while you type: slash commands, and the models to pick from. */
export type Meta = {
    commands: { name: string; description: string; hint: string }[];
    models: { value: string; label: string; resolved?: string; efforts: EffortLevel[] }[];
};
export type Image = { type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; data: string };
/** Picked on the page. A run started later for the same session keeps the model and effort (configure says why not the mode). */
export type Prefs = { model?: string; effort?: EffortLevel | null; mode?: PermissionMode };

type Content = SDKUserMessage['message']['content'];
type Pending = Ask & { resolve: (r: PermissionResult) => void; raw: Record<string, unknown>; suggestions?: PermissionUpdate[] };
type Run = {
    id: string; inbox: Inbox; query?: Query; state: RunView['state']; error?: string; pending: Map<string, Pending>; timer?: ReturnType<typeof setTimeout>; known: Promise<string>;
    /** Settles once `query` is set (or the SDK failed to load): a run is listed before that, so callers wait for it */
    ready: Promise<void>;
    used: boolean; mode: string; context?: RunView['context']; model?: string; meta?: Promise<Meta>;
    /** The session /clear is leaving, until the new one is under way */
    from?: string;
};

const IDLE_MS = 15 * 60_000; // a run with nothing to do ends after this, and the next message starts a new one
const OPEN_MS = 3 * 60_000; // one opened only to show its commands and settings ends sooner
const KEY_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];
export const MODES = new Set<PermissionMode>(['default', 'acceptEdits', 'plan', 'dontAsk', 'auto']); // never bypassPermissions from here
export const EFFORTS = new Set<EffortLevel>(['low', 'medium', 'high', 'xhigh', 'max']);

// Route handlers and pages can load this file separately in dev, so the runs live on globalThis to be shared
const runs: Map<string, Run> = ((globalThis as { __lighthouseRuns?: Map<string, Run> }).__lighthouseRuns ??= new Map());
const prefs: Map<string, Prefs> = ((globalThis as { __lighthousePrefs?: Map<string, Prefs> }).__lighthousePrefs ??= new Map());
// Where /clear took each session: the page that sent it follows
const moves: Map<string, string> = ((globalThis as { __lighthouseMoves?: Map<string, string> }).__lighthouseMoves ??= new Map());

export const movedTo = (id: string) => moves.get(id);

/** Messages for a running query: it reads them as they come, so a message sent while Claude works is queued, not lost. */
class Inbox implements AsyncIterable<SDKUserMessage> {
    private items: Content[] = [];
    private wake?: () => void;
    closed = false;
    push(content: Content) { this.items.push(content); this.wake?.(); }
    close() { this.closed = true; this.wake?.(); }
    async *[Symbol.asyncIterator]() {
        while (true) {
            const content = this.items.shift();
            if (content !== undefined) { yield { type: 'user' as const, message: { role: 'user' as const, content }, parent_tool_use_id: null }; continue; }
            if (this.closed) return;
            await new Promise<void>(r => { this.wake = r; });
            this.wake = undefined;
        }
    }
}

/**
 * Git Bash, which Claude Code needs on Windows for hooks and its Bash tool: next to the Git on PATH (this PC keeps Git
 * outside Program Files), else Git's default folders. The VS Code extension finds it the same way; a session started
 * from here must be told, or every hook fails.
 */
export function findGitBash(path: string, exists: (file: string) => boolean): string | null {
    const roots = path.split(';').flatMap(dir => {
        const m = dir.match(/^(.*?\\Git)(?:\\(?:cmd|bin|mingw64\\bin|usr\\bin|usr\\local\\bin))?\\?$/i);
        return m ? [m[1]] : [];
    });
    const candidates = [...roots, 'C:\\Program Files\\Git', 'C:\\Program Files (x86)\\Git'].map(root => `${root}\\bin\\bash.exe`);
    return candidates.find(exists) ?? null;
}

/** The environment for a session: this one, without any API key, so Claude Code uses its own login. */
export function sessionEnv(env: Record<string, string | undefined>, exists: (file: string) => boolean = () => false, windows = false): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = { ...env, CLAUDE_AGENT_SDK_CLIENT_APP: 'lighthouse' };
    for (const k of KEY_VARS) delete out[k];
    if (windows && !out.CLAUDE_CODE_GIT_BASH_PATH) {
        const bash = findGitBash(out.Path ?? out.PATH ?? '', exists);
        if (bash) out.CLAUDE_CODE_GIT_BASH_PATH = bash;
    }
    return out;
}

/** A message with any pictures, as Claude takes it: just the text when there are none. */
export function content(text: string, images: Image[] = []): Content {
    if (!images.length) return text;
    const pictures = images.map(i => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.type, data: i.data } }));
    return text ? [...pictures, { type: 'text' as const, text }] : pictures;
}

const PICTURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const PICTURE_MAX = Math.ceil((5 * 1024 * 1024 * 4) / 3); // 5 MB, the most Claude takes in one picture, as base64

/** Pictures sent from the page, checked: null when any is not one Claude takes. None is fine. */
export function picturesOf(raw: unknown): Image[] | null {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > 4) return null;
    const ok = raw.every(i => i && PICTURE_TYPES.has(i.type) && typeof i.data === 'string' && i.data.length <= PICTURE_MAX && /^[A-Za-z0-9+/]+=*$/.test(i.data));
    return ok ? raw.map(i => ({ type: i.type, data: i.data })) : null;
}

/** A settings change from the page, checked: a model by its name, an effort level (null for the default), a mode. */
export function prefsOf(body: Record<string, unknown>): Prefs | null {
    const out: Prefs = {};
    if ('model' in body) {
        if (body.model !== null && !(typeof body.model === 'string' && /^[\w.[\]-]{1,80}$/.test(body.model))) return null;
        out.model = body.model === null || body.model === 'default' ? undefined : body.model;
    }
    if ('effort' in body) {
        if (body.effort !== null && !EFFORTS.has(body.effort as EffortLevel)) return null;
        out.effort = body.effort as EffortLevel | null;
    }
    if ('mode' in body) {
        if (!MODES.has(body.mode as PermissionMode)) return null;
        out.mode = body.mode as PermissionMode;
    }
    return Object.keys(out).length ? out : null;
}

const view = (p: Pending): Ask => ({ key: p.key, kind: p.kind, tool: p.tool, summary: p.summary, input: p.input, questions: p.questions, canAlways: p.canAlways });

export function runView(id: string): RunView | null {
    const r = runs.get(id);
    if (!r) return null;
    const p = prefs.get(id);
    return { state: r.state, error: r.error, asks: [...r.pending.values()].map(view), used: r.used, context: r.context, model: p?.model ?? r.model, effort: p?.effort ?? undefined, mode: r.mode };
}

function touch(run: Run) {
    clearTimeout(run.timer);
    // Never mid-task: each result calls this again, so a long task gets its full idle time after it finishes
    run.timer = setTimeout(() => { if (!run.pending.size && run.state === 'idle') run.inbox.close(); }, run.used ? IDLE_MS : OPEN_MS);
}

/** How full the context window is, from the last reply's usage and local counts (no call to the model). */
async function measure(run: Run) {
    const c = await run.query?.getContextUsage({ detail: 'summary' }).catch(() => null);
    if (c) { run.context = { tokens: c.totalTokens, max: c.maxTokens }; run.model = c.model; }
}

/** Questions as AskUserQuestion sends them, with anything unexpected dropped. */
function questionsOf(input: Record<string, unknown>): Ask['questions'] {
    const qs = Array.isArray(input.questions) ? input.questions : [];
    return qs.flatMap((q: Record<string, unknown>) => typeof q.question !== 'string' ? [] : [{
        question: q.question, header: typeof q.header === 'string' ? q.header : '', multiSelect: q.multiSelect === true,
        options: (Array.isArray(q.options) ? q.options : []).flatMap((o: Record<string, unknown>) => (typeof o.label === 'string' ? [{ label: o.label, description: typeof o.description === 'string' ? o.description : '' }] : [])),
    }]);
}

/** Starts a run: resuming `resume`, or a new session when it is null (its id comes with Claude's first message). */
async function start(resume: string | null, cwd: string, mode: string | null): Promise<Run> {
    let named!: (id: string) => void, failed!: (e: Error) => void;
    const known = new Promise<string>((res, rej) => { named = res; failed = rej; });
    known.catch(() => undefined); // a resume never waits on it
    const p = (resume && prefs.get(resume)) || {};
    // The mode the transcript last ran in: it follows a plan you approved, which a saved pick would not
    const permissionMode = mode && MODES.has(mode as PermissionMode) ? (mode as PermissionMode) : 'default';
    let booted!: () => void;
    const ready = new Promise<void>(r => { booted = r; });
    const run: Run = { id: resume ?? '', inbox: new Inbox(), state: 'idle', pending: new Map(), known, used: false, mode: permissionMode, ready };
    // Registered before any await, so a second message sent meanwhile joins this run instead of starting another
    if (resume) { runs.set(resume, run); named(resume); }
    // Loaded by its file on this PC, worked out when it runs: a package name the bundler could see would put the whole
    // SDK into the Worker, which never runs a session (this only runs under `npm run dev`)
    const [{ join }, { pathToFileURL }] = await Promise.all([import('node:path'), import('node:url')]);
    const sdk = pathToFileURL(join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs')).href;
    const { query } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ sdk).catch((error: Error) => {
        run.state = 'ended'; run.error = error.message; failed(error); booted();
        throw error;
    })) as typeof import('@anthropic-ai/claude-agent-sdk');
    const canUseTool: CanUseTool = (tool, input, { signal, suggestions, toolUseID }) => new Promise(resolve => {
        const key = toolUseID;
        const pending: Pending = {
            key, tool, raw: input, suggestions, resolve,
            kind: tool === 'AskUserQuestion' ? 'question' : 'permission',
            summary: toolSummary(tool, input),
            input: JSON.stringify(input, null, 2).slice(0, 4000),
            questions: tool === 'AskUserQuestion' ? questionsOf(input) : [],
            canAlways: Boolean(suggestions?.length),
        };
        run.pending.set(key, pending);
        signal.addEventListener('abort', () => run.pending.delete(key));
    });
    run.query = query({
        prompt: run.inbox,
        options: { resume: resume ?? undefined, cwd, env: sessionEnv(process.env, existsSync, process.platform === 'win32'), permissionMode, model: p.model, effort: p.effort ?? undefined, canUseTool },
    });
    booted();
    (async () => {
        try {
            for await (const m of run.query!) {
                if (m.type === 'system' && m.subtype === 'init') {
                    if (!run.id) { run.id = m.session_id; runs.set(run.id, run); named(run.id); }
                    // After /clear the conversation carries on in a new session: answer to its id too, with the same settings
                    else if (m.session_id !== run.id) { runs.set(m.session_id, run); prefs.set(m.session_id, { ...prefs.get(run.id) }); run.from = run.id; run.id = m.session_id; }
                    run.mode = m.permissionMode;
                }
                // The mode can change mid-turn, as when you approve a plan
                if (m.type === 'system' && m.subtype === 'status' && m.permissionMode) run.mode = m.permissionMode;
                if (m.type === 'result') {
                    run.state = 'idle'; touch(run); void measure(run);
                    // The new transcript starts with the /clear, so it's there to read by now
                    // and the old session is let go: a reply to it later resumes it, not this one
                    if (run.from) { moves.set(run.from, run.id); if (runs.get(run.from) === run) runs.delete(run.from); run.from = undefined; }
                } else if (m.type === 'assistant' || m.type === 'user') run.state = 'working';
            }
        } catch (error) {
            run.error = error instanceof Error ? error.message : String(error);
            console.error(`Claude session ${run.id || 'new'} stopped`, error);
        } finally {
            run.state = 'ended';
            failed(new Error(run.error ?? 'The session ended before it started'));
            clearTimeout(run.timer);
            for (const p of run.pending.values()) p.resolve({ behavior: 'deny', message: 'The session ended' });
            run.pending.clear();
        }
    })();
    return run;
}

/** The run going for `id`, or a new one (a closed inbox is a run on its way out: a message pushed into it is never read). */
async function live(id: string, cwd: string, mode: string | null) {
    const run = runs.get(id);
    if (!run || run.state === 'ended' || run.inbox.closed) return start(id, cwd, mode);
    await run.ready;
    if (!run.query) throw new Error(run.error ?? 'Claude Code did not start.');
    return run;
}

/** Sends a message, with any pictures, into a session, starting a run for it when none is going. */
export async function send(id: string, text: string, cwd: string, mode: string | null, images: Image[] = []) {
    const run = await live(id, cwd, mode);
    moves.delete(id); // carrying on here: an earlier /clear's move no longer applies
    run.used = true;
    run.state = 'working';
    run.inbox.push(content(text, images));
    touch(run);
}

/**
 * Gets a session ready while you look at it, without sending anything (nothing is written to it or billed): its slash
 * commands, its models, and how full its context is. One opened and never used ends after a few minutes.
 */
export async function open(id: string, cwd: string, mode: string | null): Promise<Meta> {
    const run = await live(id, cwd, mode);
    if (!run.used) touch(run);
    void measure(run);
    const q = run.query!;
    run.meta ??= Promise.all([q.supportedCommands(), q.supportedModels()]).then(([commands, models]) => ({
        // A name starting with __ is Claude Code's own plumbing
        commands: commands.filter(c => !c.name.startsWith('__')).map(c => ({ name: c.name, description: c.description, hint: c.argumentHint })),
        models: models.map(m => ({ value: m.value, label: m.displayName, resolved: m.resolvedModel, efforts: m.supportedEffortLevels ?? [] })),
    }));
    return run.meta.catch(error => { run.meta = undefined; throw error; });
}

/**
 * Changes the model, effort or permission mode of the run going now. Model and effort are kept for any run started
 * later; the mode is not, as the transcript records it with each message and a run starts in the last one.
 */
export async function configure(id: string, change: Prefs, cwd: string, mode: string | null) {
    const { mode: _, ...kept } = change;
    if (Object.keys(kept).length) prefs.set(id, { ...prefs.get(id), ...kept });
    // A run that ended while you looked is started again, so the change applies (a new one starts with the kept ones)
    const run = await live(id, cwd, mode);
    if (!run.used) touch(run);
    const q = run.query!;
    if ('model' in change) await q.setModel(change.model);
    if ('effort' in change) await q.applyFlagSettings({ effortLevel: change.effort ?? null });
    if (change.mode) { await q.setPermissionMode(change.mode); run.mode = change.mode; }
    await measure(run); // another model can have another window
}

/** Your answer to a permission request or a question. `answers`: question text to the chosen label(s), joined by ", ". */
export function answer(id: string, key: string, a: { allow: boolean; always?: boolean; answers?: Record<string, string>; note?: string }): boolean {
    const run = runs.get(id), p = run?.pending.get(key);
    if (!run || !p) return false;
    run.pending.delete(key);
    if (!a.allow) p.resolve({ behavior: 'deny', message: a.note || 'The owner said no, from Lighthouse' });
    else if (p.kind === 'question') p.resolve({ behavior: 'allow', updatedInput: { ...p.raw, answers: a.answers ?? {} } });
    else p.resolve({ behavior: 'allow', updatedInput: p.raw, ...(a.always && p.suggestions ? { updatedPermissions: p.suggestions } : {}) });
    touch(run);
    return true;
}

/** Stops what Claude is doing now; the run stays, for your next message. */
export async function interrupt(id: string) {
    await runs.get(id)?.query?.interrupt().catch(() => undefined);
}

/** Starts a new session in `cwd` with a first message, and gives its id once Claude has it (within a minute). */
export async function startSession(cwd: string, text: string): Promise<string> {
    const run = await start(null, cwd, null);
    run.used = true;
    run.state = 'working';
    run.inbox.push(text);
    touch(run);
    const late = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Claude did not start within a minute')), 60_000));
    return Promise.race([run.known, late]);
}
