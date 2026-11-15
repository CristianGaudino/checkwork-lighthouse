import { NextResponse, type NextRequest } from 'next/server';
import { parseTail } from '@/lib/claude';
import { answer, configure, interrupt, movedTo, open, picturesOf, prefsOf, runView, send } from '@/lib/runner';
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

/** Where the session worked and its permission mode, from its transcript: a run starts there. */
async function place(file: string): Promise<{ cwd: string; mode: string | null } | { error: NextResponse }> {
    const { stat } = await import('node:fs/promises');
    const { cwd, mode } = placeOf((await readTail(file)).text);
    if (!cwd || !(await stat(cwd).then(d => d.isDirectory(), () => false))) return { error: NextResponse.json({ error: 'The folder this session worked in is gone.' }, { status: 409 }) };
    return { cwd, mode };
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
    // (a run only opened to show its settings writes nothing)
    const elsewhere = (!run?.used || run.state === 'ended') && Date.now() - tail.mtimeMs < BUSY_MS;
    return NextResponse.json({ ...slice, session, run, elsewhere, moved: movedTo(id) });
}

export async function POST(req: NextRequest, ctx: RouteContext<'/api/claude/[id]'>) {
    const { id } = await ctx.params;
    const g = await guard(req, id);
    if (g.error) return g.error;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return nope(400);
    if (body.action === 'send') {
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        const images = picturesOf(body.images);
        if (!images) return NextResponse.json({ error: 'Pictures must be PNG, JPEG, GIF or WebP, up to 5 MB each and 4 at a time.' }, { status: 400 });
        if ((!text && !images.length) || text.length > 100_000) return NextResponse.json({ error: 'Write a message first.' }, { status: 400 });
        const at = await place(g.file);
        if ('error' in at) return at.error;
        try {
            await send(id, text, at.cwd, at.mode, images);
            return NextResponse.json({ ok: true });
        } catch (error) {
            return NextResponse.json({ error: error instanceof Error ? error.message : 'Claude Code did not start.' }, { status: 502 });
        }
    }
    // Opening the page: the slash commands and models to offer (gets the session ready, sends nothing)
    if (body.action === 'open') {
        const at = await place(g.file);
        if ('error' in at) return at.error;
        try {
            return NextResponse.json(await open(id, at.cwd, at.mode));
        } catch (error) {
            return NextResponse.json({ error: error instanceof Error ? error.message : 'Claude Code did not start.' }, { status: 502 });
        }
    }
    if (body.action === 'set') {
        const change = prefsOf(body);
        if (!change) return nope(400);
        const at = await place(g.file);
        if ('error' in at) return at.error;
        try {
            await configure(id, change, at.cwd, at.mode);
            return NextResponse.json({ ok: true });
        } catch (error) {
            return NextResponse.json({ error: error instanceof Error ? error.message : 'Claude Code said no to that.' }, { status: 409 });
        }
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
