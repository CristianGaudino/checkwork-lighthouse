import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/access';
import { readSessions } from '@/lib/claude';
import { listRepos } from '@/lib/local';
import { isSessionId } from '@/lib/transcript';
import { ClaudeShell } from '../../_sections/ClaudeShell';
import { Conversation } from '../../_sections/Conversation';

export const metadata = { title: 'Claude' };

/** Local only: one session, its whole history, and a box to reply. */
export default async function ClaudeSession(props: PageProps<'/claude/[id]'>) {
    await requireAdmin();
    const { id } = await props.params;
    const [sessions, repos] = await Promise.all([readSessions(), listRepos()]);
    if (!sessions || !repos || !isSessionId(id)) notFound();
    return (
        <ClaudeShell sessions={sessions} repos={repos} current={id}>
            <Conversation key={id} id={id} />
        </ClaudeShell>
    );
}
