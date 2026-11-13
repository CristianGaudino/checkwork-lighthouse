/**
 * Recent Claude Code sessions on this PC, from the transcripts Claude Code keeps in ~/.claude/projects. Runs only under
 * `next dev`, reads only the end of each recent file, and never returns what was said: just the title, state and links.
 */

export type SessionState = 'waiting' | 'working' | 'stopped';
export type Session = { id: string; repo: string; title: string; state: SessionState; at: string; prUrl: string | null };

const RECENT_MS = 2 * 86_400_000; // sessions touched in the last two days
const TAIL_BYTES = 512 * 1024; // a transcript's end holds its last turn and latest title
const WORKING_MS = 2 * 60_000; // a tool call this fresh is still running

type Line = { type?: string; timestamp?: string; cwd?: string; aiTitle?: string; lastPrompt?: string; prUrl?: string; message?: { role?: string; content?: unknown } };

/** Reads a transcript's tail (newest last). The first line may be cut off mid-way, so unparsable lines are skipped. */
export function parseTail(text: string, id: string, now = Date.now()): Session | null {
    const lines: Line[] = text.split('\n').flatMap(l => { try { return [JSON.parse(l) as Line]; } catch { return []; } });
    const turns = lines.filter(l => (l.type === 'user' || l.type === 'assistant') && l.timestamp);
    const last = turns.at(-1);
    if (!last) return null;
    const cwd = lines.findLast(l => l.cwd)?.cwd ?? '';
    const title = lines.findLast(l => l.aiTitle)?.aiTitle ?? lines.findLast(l => l.lastPrompt)?.lastPrompt ?? 'Untitled session';
    const content = last.message?.content;
    const usesTool = Array.isArray(content) && content.some(c => (c as { type?: string }).type === 'tool_use');
    // An assistant turn that ends in text is Claude handing back to you; anything else is mid-task
    const state: SessionState = last.type === 'assistant' && !usesTool ? 'waiting' : now - Date.parse(last.timestamp!) < WORKING_MS ? 'working' : 'stopped';
    return {
        id,
        repo: cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? '?',
        title: title.replace(/\s+/g, ' ').slice(0, 120),
        state,
        at: last.timestamp!,
        prUrl: lines.findLast(l => l.prUrl)?.prUrl ?? null,
    };
}

/** VS Code links from the Claude Code extension's URI handler: resume a session, or start one with a prompt. */
export const resumeHref = (id: string) => `vscode://anthropic.claude-code/open?${new URLSearchParams({ session: id })}`;
export const askHref = (prompt: string) => `vscode://anthropic.claude-code/open?${new URLSearchParams({ prompt })}`;

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
    const order: Record<SessionState, number> = { waiting: 0, working: 1, stopped: 2 };
    // A file can be touched without a new turn, so the last turn decides too
    return sessions.filter(s => s !== null).filter(s => now - Date.parse(s.at) < RECENT_MS).sort((a, b) => order[a.state] - order[b.state] || b.at.localeCompare(a.at));
}
