import { NextResponse, type NextRequest } from 'next/server';
import { startSession } from '@/lib/runner';
import { refuse } from './guard';

/** Starts a new Claude Code session in one of this PC's repos, with a first message, and answers with its id. Local only. */
export async function POST(req: NextRequest) {
    const no = await refuse(req);
    if (no) return no;
    const body = (await req.json().catch(() => null)) as { repo?: unknown; text?: unknown } | null;
    const repo = typeof body?.repo === 'string' ? body.repo : '';
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > 100_000) return NextResponse.json({ error: 'Write a first message.' }, { status: 400 });
    const [{ stat }, path] = await Promise.all([import('node:fs/promises'), import('node:path')]);
    // Only a folder name next to this repo, never a path from the form
    const cwd = path.join(path.dirname(process.cwd()), repo);
    if (!/^[\w.-]+$/.test(repo) || repo.startsWith('.') || !(await stat(path.join(cwd, '.git')).then(() => true, () => false))) {
        return NextResponse.json({ error: 'Pick a repo on this PC.' }, { status: 400 });
    }
    try {
        return NextResponse.json({ id: await startSession(cwd, text) });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Claude did not start.' }, { status: 502 });
    }
}
