/**
 * Recent Claude Code sessions on this PC, from the transcripts Claude Code keeps in ~/.claude/projects. Runs only under
 * `next dev` and only reads. It returns the title, state and links, and, when a session is asking you something, that
 * question and its options (the owner's call): nothing else that was said.
 */

/**
 * question: Claude asked you something (or has a plan for you to approve). waiting: it finished and handed back.
 * working: a step started in the last two minutes. blocked: a step has been going longer, which is a long build or a
 * permission prompt waiting on you (the transcript can't tell which). stopped: it ended mid-task.
 */
export type SessionState = 'question' | 'waiting' | 'working' | 'blocked' | 'stopped';
export type Question = { text: string; options: string[] };
export type Session = { id: string; repo: string; title: string; state: SessionState; at: string; prUrl: string | null; questions: Question[] };

const RECENT_MS = 2 * 86_400_000; // sessions touched in the last two days
const TAIL_BYTES = 512 * 1024; // a transcript's end holds its last turn and latest title
const WORKING_MS = 2 * 60_000; // a tool call this fresh is still running

type Block = { type?: string; name?: string; input?: { questions?: { question?: unknown; options?: { label?: unknown }[] }[] } };
type Line = { type?: string; timestamp?: string; cwd?: string; aiTitle?: string; lastPrompt?: string; prUrl?: string; isSidechain?: boolean; requestId?: string; message?: { id?: string; role?: string; content?: unknown; usage?: { output_tokens?: number } } };

const clip = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().slice(0, max);

/** The questions an AskUserQuestion step asks, trimmed. Anything not shaped like one is skipped. */
function questionsOf(block: Block): Question[] {
    return (block.input?.questions ?? []).flatMap(q => typeof q.question === 'string'
        ? [{ text: clip(q.question, 300), options: (q.options ?? []).flatMap(o => (typeof o.label === 'string' ? [clip(o.label, 80)] : [])).slice(0, 4) }]
        : []);
}

/** Reads a transcript's tail (newest last). The first line may be cut off mid-way, so unparsable lines are skipped. */
export function parseTail(text: string, id: string, now = Date.now()): Session | null {
    const lines: Line[] = text.split('\n').flatMap(l => { try { return [JSON.parse(l) as Line]; } catch { return []; } });
    // A subagent's turns are its own, not the session's
    const turns = lines.filter(l => (l.type === 'user' || l.type === 'assistant') && l.timestamp && !l.isSidechain);
    const last = turns.at(-1);
    if (!last) return null;
    const cwd = lines.findLast(l => l.cwd)?.cwd ?? '';
    const title = lines.findLast(l => l.aiTitle)?.aiTitle ?? lines.findLast(l => l.lastPrompt)?.lastPrompt ?? 'Untitled session';
    // Each content block is its own line, so the last line's block is where the turn stands
    const content = last.message?.content;
    const tool = Array.isArray(content) ? (content as Block[]).findLast(c => c.type === 'tool_use') : undefined;
    const fresh = now - Date.parse(last.timestamp!) < WORKING_MS;
    const asks = last.type === 'assistant' && (tool?.name === 'AskUserQuestion' || tool?.name === 'ExitPlanMode');
    const state: SessionState = asks ? 'question'
        : last.type === 'assistant' && !tool ? 'waiting'
        : fresh ? 'working'
        : last.type === 'assistant' ? 'blocked' : 'stopped';
    return {
        id,
        repo: cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? '?',
        title: clip(title, 120),
        state,
        at: last.timestamp!,
        prUrl: lines.findLast(l => l.prUrl)?.prUrl ?? null,
        questions: asks && tool ? (tool.name === 'ExitPlanMode' ? [{ text: 'Has a plan for you to approve', options: [] }] : questionsOf(tool)) : [],
    };
}

/** Tokens Claude wrote since `since`, in one transcript. A reply's blocks share one request and repeat its usage, so each counts once. */
export function tokensSince(text: string, since: number): number {
    const seen = new Set<string>();
    let total = 0;
    for (const l of text.split('\n')) {
        if (!l.includes('"output_tokens"')) continue;
        let line: Line;
        try { line = JSON.parse(l); } catch { continue; }
        const key = line.requestId ?? line.message?.id;
        if (line.type !== 'assistant' || !line.timestamp || Date.parse(line.timestamp) < since || !key || seen.has(key)) continue;
        seen.add(key);
        total += line.message?.usage?.output_tokens ?? 0;
    }
    return total;
}

// In their own file so the browser's code can build them without this file's node: imports
export { askHref, resumeHref } from './vscode';

/** null outside `next dev`. Newest first, waiting sessions on top. */
export async function readSessions(now = Date.now()): Promise<Session[] | null> {
    if (process.env.NODE_ENV !== 'development') return null;
    const [{ readdir, stat, open }, path, os] = await Promise.all([import('node:fs/promises'), import('node:path'), import('node:os')]);
    const root = path.join(os.homedir(), '.claude', 'projects');
    const dirs = await readdir(root).catch(() => [] as string[]);
    const files = (await Promise.all(dirs.map(async d => {
        const names = await readdir(path.join(root, d)).catch(() => [] as string[]);
        return Promise.all(names.filter(n => n.endsWith('.jsonl')).map(async n => {
            const file = path.join(root, d, n);
            const s = await stat(file);
            return now - s.mtimeMs < RECENT_MS ? { file, size: s.size, id: n.slice(0, -6) } : null;
        }));
    }))).flat().filter(f => f !== null);
    const sessions = await Promise.all(files.map(async f => {
        const handle = await open(f.file, 'r');
        try {
            const length = Math.min(f.size, TAIL_BYTES);
            const { buffer } = await handle.read(Buffer.alloc(length), 0, length, f.size - length);
            return parseTail(buffer.toString('utf8'), f.id, now);
        } finally {
            await handle.close();
        }
    }));
    const order: Record<SessionState, number> = { question: 0, blocked: 1, waiting: 2, working: 3, stopped: 4 };
    // A file can be touched without a new turn, so the last turn decides too
    return sessions.filter(s => s !== null).filter(s => now - Date.parse(s.at) < RECENT_MS).sort((a, b) => order[a.state] - order[b.state] || b.at.localeCompare(a.at));
}

const FRESH_MS = 12 * 3_600_000;

/**
 * Sessions that need you: a question always; blocked or handed back only within twelve hours, since a finished session
 * nobody went back to, or one that died mid-step, would otherwise count for two days.
 */
export const needsYou = (s: Session, now = Date.now()) =>
    s.state === 'question' || ((s.state === 'blocked' || s.state === 'waiting') && now - Date.parse(s.at) < FRESH_MS);

/** Tokens Claude wrote today (since local midnight) per repo, from every transcript touched today. null outside `next dev`. */
export async function readUsageToday(now = new Date()): Promise<{ repo: string; tokens: number; sessions: number }[] | null> {
    if (process.env.NODE_ENV !== 'development') return null;
    const [{ readdir, readFile, stat }, path, os] = await Promise.all([import('node:fs/promises'), import('node:path'), import('node:os')]);
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const root = path.join(os.homedir(), '.claude', 'projects');
    const by = new Map<string, { tokens: number; sessions: number }>();
    for (const d of await readdir(root).catch(() => [] as string[])) {
        for (const n of (await readdir(path.join(root, d)).catch(() => [] as string[])).filter(n => n.endsWith('.jsonl'))) {
            const file = path.join(root, d, n);
            if ((await stat(file)).mtimeMs < since) continue;
            const text = await readFile(file, 'utf8');
            const tokens = tokensSince(text, since);
            if (!tokens) continue;
            const repo = parseTail(text.slice(-TAIL_BYTES), n, now.getTime())?.repo ?? '?';
            const row = by.get(repo) ?? { tokens: 0, sessions: 0 };
            by.set(repo, { tokens: row.tokens + tokens, sessions: row.sessions + 1 });
        }
    }
    return [...by].map(([repo, r]) => ({ repo, ...r })).sort((a, b) => b.tokens - a.tokens);
}
