import { ago } from '@/lib/today';
import { resumeHref, type Session, type SessionState } from '@/lib/claude';
import { ext, link, panel, Section } from './ui';

const STATE: Record<SessionState, { text: string; dot: string }> = {
    waiting: { text: 'Waiting for you', dot: 'bg-warn' },
    working: { text: 'Working', dot: 'bg-ok' },
    stopped: { text: 'Stopped mid-task', dot: 'bg-fg-muted' },
};

/** Local only: Claude Code sessions from the last two days, the ones waiting for a reply first. Resume opens one in VS Code. */
export function ClaudeSessions({ sessions, title = 'Claude sessions' }: { sessions: Session[]; title?: string }) {
    const waiting = sessions.filter(s => s.state === 'waiting').length;
    return (
        <Section id="claude" title={title} aside={sessions.length ? (waiting ? `${waiting} waiting` : 'None waiting') : undefined}>
            {sessions.length ? (
                <ul className={panel}>
                    {sessions.map(s => (
                        <li key={s.id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[minmax(9rem,12rem)_1fr_auto] sm:items-baseline">
                            <span className="flex items-center gap-3 font-medium">
                                <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATE[s.state].dot}`} />
                                {s.repo}
                            </span>
                            <span className="col-span-2 min-w-0 pl-5 sm:col-span-1 sm:pl-0">
                                {s.title}
                                <span className="block text-fg-muted">{STATE[s.state].text}, {ago(s.at)}</span>
                            </span>
                            <span className="col-start-2 row-start-1 flex gap-4 text-fg-muted sm:col-start-auto sm:row-start-auto">
                                {s.prUrl && <a {...ext} className={link} href={s.prUrl}>PR</a>}
                                <a className={link} href={resumeHref(s.id)} title="Opens the session in Claude Code, in VS Code">Resume</a>
                            </span>
                        </li>
                    ))}
                </ul>
            ) : <p className="mt-3 text-sm text-fg-muted">None in the last two days</p>}
        </Section>
    );
}
