/**
 * A Claude Code session's conversation, read from its transcript (~/.claude/projects/<folder>/<id>.jsonl) for the
 * Claude page. Transcripts reach hundreds of MB (mostly tool output and copies of API requests), so they are read in
 * pieces: the newest part first, older parts as you scroll up, and only the new bytes while the session runs.
 */

export type Entry =
    | { id: string; at: string; kind: 'you' | 'claude' | 'thinking'; text: string }
    | { id: string; at: string; kind: 'tool'; toolId: string; name: string; summary: string; input: string }
    | { id: string; at: string; kind: 'result'; toolId: string; text: string; error: boolean };

const TEXT_MAX = 20_000, IO_MAX = 4_000;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n… ${text.length - max} more characters` : text);

/** Text the harness adds to a prompt (reminders, IDE context) is not what you wrote. */
const own = (text: string) => text.replace(/<(system-reminder|ide_selection|ide_opened_file|ide_diagnostics)>[\s\S]*?<\/\1>/g, '').trim();

type Block = { type?: string; text?: string; thinking?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown; is_error?: boolean };
type Line = { type?: string; uuid?: string; timestamp?: string; isMeta?: boolean; isSidechain?: boolean; isCompactSummary?: boolean; message?: { content?: unknown } };

/** One line for a tool step, like the command it ran or the file it read. */
export function toolSummary(name: string, input: Record<string, unknown> = {}): string {
    const pick = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '');
    const first = (s: string) => s.split('\n')[0].slice(0, 160);
    if (name === 'Bash' || name === 'PowerShell') return first(pick('description') || pick('command'));
    if (name === 'AskUserQuestion') {
        const qs = Array.isArray(input.questions) ? (input.questions as { question?: unknown }[]) : [];
        return first(qs.map(q => (typeof q.question === 'string' ? q.question : '')).filter(Boolean).join(' / '));
    }
    return first(pick('file_path') || pick('pattern') || pick('description') || pick('url') || pick('query') || pick('skill') || pick('prompt') || JSON.stringify(input).slice(0, 160));
}

const resultText = (content: unknown): string =>
    typeof content === 'string' ? content
        : Array.isArray(content) ? content.map(c => ((c as Block).type === 'text' ? (c as Block).text ?? '' : (c as Block).type === 'image' ? '[image]' : '')).join('\n')
        : '';

/** The conversation in some transcript lines, oldest first. Lines that aren't JSON (a cut-off first line) are skipped. */
export function parseLines(lines: string[]): Entry[] {
    const out: Entry[] = [];
    for (const raw of lines) {
        // A cheap look before parsing: most bytes are lines this page never shows
        if (!raw.includes('"type":"user"') && !raw.includes('"type":"assistant"')) continue;
        let line: Line;
        try { line = JSON.parse(raw); } catch { continue; }
        if ((line.type !== 'user' && line.type !== 'assistant') || line.isSidechain || line.isMeta || line.isCompactSummary || !line.uuid) continue;
        const at = line.timestamp ?? '', content = line.message?.content;
        const blocks: Block[] = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
        blocks.forEach((b, i) => {
            const id = `${line.uuid}:${i}`;
            if (b.type === 'text' && b.text) {
                const text = line.type === 'user' ? own(b.text) : b.text;
                // Slash-command plumbing and interrupt markers are the harness talking, not you
                if (text && !(line.type === 'user' && /^<(command-|local-command-)/.test(text))) out.push({ id, at, kind: line.type === 'user' ? 'you' : 'claude', text: clip(text, TEXT_MAX) });
            } else if (b.type === 'image' && line.type === 'user') {
                out.push({ id, at, kind: 'you', text: '[image]' });
            } else if (b.type === 'thinking' && b.thinking) {
                out.push({ id, at, kind: 'thinking', text: clip(b.thinking, TEXT_MAX) });
            } else if (b.type === 'tool_use' && b.id && b.name) {
                out.push({ id, at, kind: 'tool', toolId: b.id, name: b.name, summary: toolSummary(b.name, b.input), input: clip(JSON.stringify(b.input ?? {}, null, 2), IO_MAX) });
            } else if (b.type === 'tool_result' && b.tool_use_id) {
                out.push({ id, at, kind: 'result', toolId: b.tool_use_id, text: clip(resultText(b.content), IO_MAX), error: Boolean(b.is_error) });
            }
        });
    }
    return out;
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isSessionId = (id: unknown): id is string => typeof id === 'string' && ID.test(id);

/** The transcript file for a session id, or null. Only a well-formed id is ever joined into a path. */
export async function transcriptPath(id: string): Promise<string | null> {
    if (!isSessionId(id)) return null;
    const [{ readdir, stat }, path, os] = await Promise.all([import('node:fs/promises'), import('node:path'), import('node:os')]);
    const root = path.join(os.homedir(), '.claude', 'projects');
    for (const d of await readdir(root).catch(() => [] as string[])) {
        const file = path.join(root, d, `${id}.jsonl`);
        if (await stat(file).then(s => s.isFile(), () => false)) return file;
    }
    return null;
}

/**
 * Where a session works and how it asks for permission, from the newest lines that say so: Lighthouse resumes it in
 * the same folder and mode. `mode` is null when no line says.
 */
export function placeOf(tail: string): { cwd: string | null; mode: string | null } {
    const last = (re: RegExp) => [...tail.matchAll(re)].at(-1)?.[1] ?? null;
    const cwd = last(/"cwd":"((?:[^"\\]|\\.)*)"/g);
    return { cwd: cwd && JSON.parse(`"${cwd}"`), mode: last(/"permissionMode":"([a-zA-Z]+)"/g) };
}

const CHUNK = 2 * 1024 * 1024, BACK_MAX = 24 * 1024 * 1024, AHEAD_MAX = 8 * 1024 * 1024, WANT = 80;

/**
 * A slice of a transcript. `before`: read backwards from this byte until there is enough to show (the first call
 * passes nothing, for the end). `after`: only what was written since this byte. Returns the entries and the byte
 * range they cover, always on line boundaries, so the next call carries on exactly. `reset`: the file shrank (a new
 * transcript under the same id), so the page should start over.
 */
export async function readTranscript(file: string, at: { before?: number; after?: number }): Promise<{ entries: Entry[]; start: number; end: number; reset?: boolean }> {
    const { open } = await import('node:fs/promises');
    const handle = await open(file, 'r');
    try {
        const size = (await handle.stat()).size;
        const read = async (from: number, to: number) => {
            const buf = Buffer.alloc(to - from);
            await handle.read(buf, 0, buf.length, from);
            return buf;
        };
        if (at.after !== undefined) {
            if (at.after > size) return { entries: [], start: 0, end: 0, reset: true };
            // A burst bigger than this is skipped to its last part; the page can still scroll up for the rest
            const from = Math.max(at.after, size - AHEAD_MAX);
            const buf = await read(from, size);
            // Stop at the last full line: the one being written now comes next time
            const cut = buf.lastIndexOf(0x0a) + 1;
            const lines = buf.subarray(0, cut).toString('utf8').split('\n');
            if (from > at.after) lines.shift();
            return { entries: parseLines(lines), start: at.after, end: from + cut };
        }
        let end = Math.min(at.before ?? size, size);
        if (at.before === undefined) {
            // The newest line may still be half written: end at the last full one
            const from = Math.max(0, end - CHUNK);
            end = from + (await read(from, end)).lastIndexOf(0x0a) + 1;
        }
        let start = end, entries: Entry[] = [], chunk = CHUNK;
        while (start > 0 && entries.length < WANT && end - start < BACK_MAX) {
            const from = Math.max(0, start - chunk);
            const buf = await read(from, start);
            // Bytes before the first newline may be the end of an earlier line: they are read again next round. The
            // buffer's own last byte is the newline that ends it, so it doesn't count as finding one
            const nl = from === 0 ? -1 : buf.subarray(0, buf.length - 1).indexOf(0x0a);
            if (from > 0 && nl < 0) { chunk *= 2; continue; } // one line longer than the chunk: read further back
            entries = [...parseLines(buf.subarray(nl + 1).toString('utf8').split('\n')), ...entries];
            start = from + nl + 1;
            chunk = CHUNK;
        }
        return { entries, start, end };
    } finally {
        await handle.close();
    }
}
