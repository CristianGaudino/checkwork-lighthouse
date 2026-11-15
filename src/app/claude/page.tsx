import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/access';
import { readSessions } from '@/lib/claude';
import { listRepos } from '@/lib/local';
import { ClaudeShell } from '../_sections/ClaudeShell';

export const metadata = { title: 'Claude' };

/** Local only: every Claude Code session on this PC, to open, follow and reply to here. */
export default async function Claude() {
    await requireAdmin();
    const [sessions, repos] = await Promise.all([readSessions(), listRepos()]);
    if (!sessions || !repos) notFound();
    return (
        <ClaudeShell sessions={sessions} repos={repos}>
            <p className="m-auto text-sm text-fg-muted">Pick a session, or start a new one</p>
        </ClaudeShell>
    );
}
