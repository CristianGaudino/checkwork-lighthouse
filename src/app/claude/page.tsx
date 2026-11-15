import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/access';

export const metadata = { title: 'Claude' };

/** Local only: every Claude Code session on this PC (the list is the layout's), to open, follow and reply to here. */
export default async function Claude() {
    await requireAdmin();
    if (process.env.NODE_ENV !== 'development') notFound();
    return <p className="m-auto text-sm text-fg-muted">Pick a session, or start a new one</p>;
}
