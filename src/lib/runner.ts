import type { CanUseTool, PermissionMode, PermissionResult, PermissionUpdate, Query } from '@anthropic-ai/claude-agent-sdk';
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
export type RunView = { state: 'working' | 'idle' | 'ended'; error?: string; asks: Ask[] };

type Pending = Ask & { resolve: (r: PermissionResult) => void; raw: Record<string, unknown>; suggestions?: PermissionUpdate[] };
type Run = { id: string; inbox: Inbox; query?: Query; state: RunView['state']; error?: string; pending: Map<string, Pending>; timer?: ReturnType<typeof setTimeout>; known: Promise<string> };

const IDLE_MS = 15 * 60_000; // a run with nothing to do ends after this, and the next message starts a new one
const KEY_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];
const MODES = new Set<PermissionMode>(['default', 'acceptEdits', 'plan', 'dontAsk', 'auto']); // never bypassPermissions from here

// Route handlers and pages can load this file separately in dev, so the runs live on globalThis to be shared
const runs: Map<string, Run> = ((globalThis as { __lighthouseRuns?: Map<string, Run> }).__lighthouseRuns ??= new Map());

/** Messages for a running query: it reads them as they come, so a message sent while Claude works is queued, not lost. */
class Inbox implements AsyncIterable<{ type: 'user'; message: { role: 'user'; content: string }; parent_tool_use_id: null }> {
    private items: string[] = [];
    private wake?: () => void;
    private closed = false;
    push(text: string) { this.items.push(text); this.wake?.(); }
    close() { this.closed = true; this.wake?.(); }
    async *[Symbol.asyncIterator]() {
        while (true) {
            const text = this.items.shift();
            if (text !== undefined) { yield { type: 'user' as const, message: { role: 'user' as const, content: text }, parent_tool_use_id: null }; continue; }
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

const view = (p: Pending): Ask => ({ key: p.key, kind: p.kind, tool: p.tool, summary: p.summary, input: p.input, questions: p.questions, canAlways: p.canAlways });

export function runView(id: string): RunView | null {
    const r = runs.get(id);
    return r ? { state: r.state, error: r.error, asks: [...r.pending.values()].map(view) } : null;
}

function touch(run: Run) {
    clearTimeout(run.timer);
    run.timer = setTimeout(() => { if (!run.pending.size) run.inbox.close(); }, IDLE_MS);
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
    // Loaded by its file on this PC, worked out when it runs: a package name the bundler could see would put the whole
    // SDK into the Worker, which never runs a session (this only runs under `npm run dev`)
    const [{ join }, { pathToFileURL }] = await Promise.all([import('node:path'), import('node:url')]);
    const sdk = pathToFileURL(join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs')).href;
    const { query } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ sdk)) as typeof import('@anthropic-ai/claude-agent-sdk');
    let named!: (id: string) => void, failed!: (e: Error) => void;
    const known = new Promise<string>((res, rej) => { named = res; failed = rej; });
    known.catch(() => undefined); // a resume never waits on it
    const run: Run = { id: resume ?? '', inbox: new Inbox(), state: 'working', pending: new Map(), known };
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
        options: { resume: resume ?? undefined, cwd, env: sessionEnv(process.env, existsSync, process.platform === 'win32'), permissionMode: mode && MODES.has(mode as PermissionMode) ? (mode as PermissionMode) : 'default', canUseTool },
    });
    if (resume) { runs.set(resume, run); named(resume); }
    (async () => {
        try {
            for await (const m of run.query!) {
                if (m.type === 'system' && m.subtype === 'init' && !run.id) { run.id = m.session_id; runs.set(run.id, run); named(run.id); }
                if (m.type === 'result') { run.state = 'idle'; touch(run); } else if (m.type === 'assistant' || m.type === 'user') run.state = 'working';
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

/** Sends a message into a session, starting a run for it when none is going. */
export async function send(id: string, text: string, cwd: string, mode: string | null) {
    let run = runs.get(id);
    if (!run || run.state === 'ended') run = await start(id, cwd, mode);
    run.state = 'working';
    run.inbox.push(text);
    touch(run);
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
    run.inbox.push(text);
    touch(run);
    const late = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Claude did not start within a minute')), 60_000));
    return Promise.race([run.known, late]);
}
