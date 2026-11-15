import { notFound } from 'next/navigation';
import { adminEmail, requireAdmin } from '@/lib/access';
import { parseTail } from '@/lib/claude';
import { isSessionId, readTail, transcriptPath } from '@/lib/transcript';
import { Conversation } from '../../_sections/Conversation';

/** The session's title in the tab, so a few open sessions can be told apart. Nothing for anyone else, or off this PC. */
export async function generateMetadata(props: PageProps<'/claude/[id]'>) {
    const { id } = await props.params;
    const file = process.env.NODE_ENV === 'development' && (await adminEmail()) ? await transcriptPath(id) : null;
    return { title: (file && parseTail((await readTail(file)).text, id)?.title) || 'Claude' };
}

/** Local only: one session, its whole history, and a box to reply. */
export default async function ClaudeSession(props: PageProps<'/claude/[id]'>) {
    await requireAdmin();
    const { id } = await props.params;
    if (process.env.NODE_ENV !== 'development' || !isSessionId(id)) notFound();
    return <Conversation key={id} id={id} />;
}
