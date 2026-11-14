import { NextResponse, type NextRequest } from 'next/server';
import { parseTail } from '@/lib/claude';
import { answer, interrupt, runView, send } from '@/lib/runner';
import { isSessionId, placeOf, readTranscript, transcriptPath } from '@/lib/transcript';
import { refuse } from '../guard';

/**
 * One Claude Code session, for the Claude page: GET reads its conversation (the newest part, older parts, or what's
 * new since the last read) with how it stands; POST sends a message, answers a request, or stops it.
 * Local only, and only for this site's own pages (guard.ts).
 */

const TAIL = 512 * 1024;
const BUSY_MS = 2 * 60_000;

const nope = (status: number) => new NextResponse(null, { status });

async function guard(req: NextRequest, id: string) {
    const no = await refuse(req);
    if (no) return { error: no };
    const file = isSessionId(id) ? await transcriptPath(id) : null;
    return file ? { file } : { error: nope(404) };
}

const num = (v: string | null) => (v !== null && /^\d+$/.test(v) ? Number(v) : undefined);

export async function GET(req: NextRequest, ctx: RouteContext<'/api/claude/[id]'>) {
    const { id } = await ctx.params;
    const g = await guard(req, id);
    if (g.error) return g.error;
    const { open, stat } = await import('node:fs/promises');
    const q = req.nextUrl.searchParams;
    const [slice, s] = await Promise.all([readTranscript(g.file, { before: num(q.get('before')), after: num(q.get('after')) }), stat(g.file)]);
    // How it stands, from the file's end
    const handle = await open(g.file, 'r');
    const length = Math.min(s.size, TAIL);
    const { buffer } = await handle.read(Buffer.alloc(length), 0, length, s.size - length).finally(() => handle.close());
    const session = parseTail(buffer.toString('utf8'), id);
    const run = runView(id);
    // Written to a moment ago by something other than Lighthouse: most likely open in VS Code right now
    const elsewhere = (!run || run.state === 'ended') && Date.now() - s.mtimeMs < BUSY_MS;
    return NextResponse.json({ ...slice, session, run, elsewhere });
}

export async function POST(req: NextRequest, ctx: RouteContext<'/api/claude/[id]'>) {
    const { id } = await ctx.params;
    const g = await guard(req, id);
    if (g.error) return g.error;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return nope(400);
    if (body.action === 'send') {
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text || text.length > 100_000) return NextResponse.json({ error: 'Write a message first.' }, { status: 400 });
        const { open, stat } = await import('node:fs/promises');
        const size = (await stat(g.file)).size;
        const handle = await open(g.file, 'r');
        const length = Math.min(size, TAIL);
        const { buffer } = await handle.read(Buffer.alloc(length), 0, length, size - length).finally(() => handle.close());
        const { cwd, mode } = placeOf(buffer.toString('utf8'));
        if (!cwd || !(await stat(cwd).then(d => d.isDirectory(), () => false))) return NextResponse.json({ error: 'The folder this session worked in is gone.' }, { status: 409 });
        await send(id, text, cwd, mode);
        return NextResponse.json({ ok: true });
    }
    if (body.action === 'answer' && typeof body.key === 'string') {
        const answers = body.answers && typeof body.answers === 'object' ? Object.fromEntries(Object.entries(body.answers).filter(([, v]) => typeof v === 'string')) as Record<string, string> : undefined;
        const ok = answer(id, body.key, { allow: body.allow === true, always: body.always === true, answers, note: typeof body.note === 'string' ? body.note.slice(0, 2000) : undefined });
        return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'That request has already been answered or has ended.' }, { status: 409 });
    }
    if (body.action === 'stop') {
        await interrupt(id);
        return NextResponse.json({ ok: true });
    }
    return nope(400);
}
