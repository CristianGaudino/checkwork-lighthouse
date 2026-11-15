'use client';

import Link, { useLinkStatus } from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';

/** The open session's id, from the address: the list stays in the layout, so it can't be told by props. */
const useCurrent = () => useSelectedLayoutSegment();

/** The list and the open session: side by side on a wide screen, one at a time on a phone. */
export function ClaudePanes({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
    const current = useCurrent();
    return (
        <div className="grid h-[calc(100dvh-12rem)] min-h-96 grid-cols-[minmax(0,1fr)] gap-6 lg:h-[calc(100dvh-6.5rem)] lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className={`min-h-0 flex-col gap-3 ${current ? 'hidden lg:flex' : 'flex'}`}>{list}</aside>
            <section className={`min-h-0 flex-col ${current ? 'flex' : 'hidden lg:flex'}`}>
                {current && <Link href="/claude" className="mb-2 text-sm text-fg-muted lg:hidden">All sessions</Link>}
                {children}
            </section>
        </div>
    );
}

/** A session in the list: marked while open, and dimmed for the moment between the click and the session showing. */
export function SessionLink({ id, children }: { id: string; children: React.ReactNode }) {
    const current = useCurrent() === id;
    return (
        <Link
            href={`/claude/${id}`}
            aria-current={current ? 'page' : undefined}
            className="grid grid-cols-[auto_1fr] gap-x-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface/60 aria-[current=page]:bg-surface"
        >
            <Pending>{children}</Pending>
        </Link>
    );
}

const Pending = ({ children }: { children: React.ReactNode }) => {
    const { pending } = useLinkStatus();
    return <span className={`contents ${pending ? '[&>*]:opacity-60' : ''}`}>{children}</span>;
};
