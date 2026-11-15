import { NextResponse, type NextRequest } from 'next/server';
import { parseTail } from '@/lib/claude';
import { answer, interrupt, runView, send } from '@/lib/runner';
import { isSessionId, placeOf, readTail, readTranscript, transcriptPath } from '@/lib/transcript';
import { refuse } from '../guard';

/**
 * One Claude Code session, for the Claude page: GET reads its conversation (the newest part, older parts, or what's
 * new since the last read) with how it stands; POST sends a message, answers a request, or stops it.
 * Local only, and only for this site's own pages (guard.ts).
 */

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
    const q = req.nextUrl.searchParams;
    // The piece asked for, and how the session stands from the file's end
    const [slice, tail] = await Promise.all([readTranscript(g.file, { before: num(q.get('before')), after: num(q.get('after')) }), readTail(g.file)]);
    const session = parseTail(tail.text, id);
    const run = runView(id);
    // Written to a moment ago by something other than Lighthouse: most likely open in VS Code right now
    const elsewhere = (!run || run.state === 'ended') && Date.now() - tail.mtimeMs < BUSY_MS;
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
        const { stat } = await import('node:fs/promises');
        const { cwd, mode } = placeOf((await readTail(g.file)).text);
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
