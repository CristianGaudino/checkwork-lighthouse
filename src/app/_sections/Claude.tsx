import { ago } from '@/lib/today';
import { resumeHref, type Session, type SessionState } from '@/lib/claude';
import { ext, Heading, link } from './ui';

const STATE: Record<SessionState, { text: string; dot: string }> = {
    waiting: { text: 'Waiting for you', dot: 'bg-warn' },
    working: { text: 'Working', dot: 'bg-ok' },
    stopped: { text: 'Stopped mid-task', dot: 'bg-fg-muted' },
};

/** Local only: Claude Code sessions from the last two days, the ones waiting for a reply first. */
export function ClaudeSessions({ sessions }: { sessions: Session[] }) {
    const waiting = sessions.filter(s => s.state === 'waiting').length;
    return (
        <section>
            <Heading id="claude">Claude sessions</Heading>
            <p className="mt-1 text-sm text-fg-muted">
                {sessions.length ? `Last two days. ${waiting ? `${waiting} waiting for you.` : 'None waiting for you.'} Resume opens it in VS Code.` : 'No Claude Code sessions in the last two days.'}
            </p>
            {sessions.length > 0 && (
                <ul className="mt-4 divide-y divide-line border-y border-line">
                    {sessions.map(s => (
                        <li key={s.id} className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(10rem,14rem)_1fr_auto] sm:items-baseline">
                            <span className="flex items-center gap-3 text-base font-medium">
                                <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATE[s.state].dot}`} />
                                {s.repo}
                            </span>
                            <span className="min-w-0 pl-5 sm:pl-0">
                                {s.title}
                                <span className="block text-fg-muted">{STATE[s.state].text}, {ago(s.at)}</span>
                            </span>
                            <span className="flex gap-4 pl-5 text-fg-muted sm:pl-0">
                                {s.prUrl && <a {...ext} className={link} href={s.prUrl}>PR</a>}
                                <a className={link} href={resumeHref(s.id)} title="Opens the session in Claude Code, in your VS Code window">Resume</a>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
