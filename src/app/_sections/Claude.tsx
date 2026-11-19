import Link from 'next/link';
import { ago } from '@/lib/today';
import { needsYou, sessionKey, type Session, type SessionState } from '@/lib/claude';
import { snoozeTask } from '../act';
import { resumeHref } from '@/lib/vscode';
import { ProjectIcon } from './ProjectIcon';
import { ext, link, n, num, panel, Section, short } from './ui';

const STATE: Record<SessionState, { text: string; dot: string }> = {
    question: { text: 'Asking you', dot: 'bg-warn' },
    blocked: { text: 'Waiting for your OK, or on a long step', dot: 'bg-warn' },
    waiting: { text: 'Your turn', dot: 'bg-warn' },
    working: { text: 'Working', dot: 'bg-ok' },
    stopped: { text: 'Stopped mid-task', dot: 'bg-fg-muted' },
};

/**
 * Local only: Claude Code sessions from the last two days, the ones that need you first. A session asking you something
 * shows the question and its choices. Open (or Answer) goes to the session on the Claude page, to read and reply there.
 * `more`: a link to the full list, for the Overview's short one. `oneRepo`: a project's own page, so no repo column.
 */
export function ClaudeSessions({ sessions, title = 'Claude sessions', more, oneRepo }: { sessions: Session[]; title?: string; more?: string; oneRepo?: boolean }) {
    const waiting = sessions.filter(s => needsYou(s)).length;
    const aside = more ? <Link className={link} href={more}>All sessions</Link> : sessions.length ? (waiting ? `${waiting} need you` : 'None need you') : undefined;
    return (
        <Section id="claude" title={title} aside={aside}>
            {sessions.length ? (
                <ul className={panel}>
                    {sessions.map(s => (
                        <li key={s.id} className={`grid gap-x-4 gap-y-2 px-4 py-3 text-sm sm:items-baseline ${oneRepo ? 'sm:grid-cols-[1fr_auto]' : 'sm:grid-cols-[minmax(9rem,12rem)_1fr_auto]'}`}>
                            {!oneRepo && (
                                <Link href={`/claude/${s.id}`} className="flex items-center gap-3 font-medium hover:underline hover:underline-offset-4">
                                    <ProjectIcon project={s.repo} />
                                    {s.repo}
                                </Link>
                            )}
                            <div className={`min-w-0 ${oneRepo ? '' : 'pl-8 sm:pl-0'}`}>
                                <p>{s.title}</p>
                                <p className="flex items-center gap-2 text-fg-muted">
                                    <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATE[s.state].dot}`} />
                                    {STATE[s.state].text}, {ago(s.at)}
                                </p>
                                {s.questions.map(q => (
                                    <div key={q.text} className="mt-2 rounded-xl bg-surface px-3 py-2">
                                        <p>{q.text}</p>
                                        {q.options.length > 0 && <p className="mt-1 text-fg-muted">{q.options.join(', ')}</p>}
                                    </div>
                                ))}
                            </div>
                            <span className={`flex flex-wrap gap-x-4 gap-y-1 text-fg-muted sm:justify-end ${oneRepo ? '' : 'pl-8 sm:pl-0'}`}>
                                {s.prUrl && <a {...ext} className={link} href={s.prUrl}>PR</a>}
                                <Link className={`${link} text-fg`} href={`/claude/${s.id}`}>{s.state === 'question' ? 'Answer' : 'Open'}</Link>
                                <a className={link} href={resumeHref(s.id)} title="Opens the session in Claude Code, in VS Code">VS Code</a>
                                {/* Read it and nothing to say: it stops needing you until Claude's next turn (a cookie, like Snooze) */}
                                {needsYou(s) && (
                                    <form action={snoozeTask} className="contents">
                                        <input type="hidden" name="key" value={sessionKey(s)} />
                                        <button type="submit" name="days" value={1} className={link} title="Stops counting it until Claude's next turn">Done</button>
                                    </form>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : <p className="mt-3 text-sm text-fg-muted">{more ? 'No session needs you' : 'None in the last two days'}</p>}
        </Section>
    );
}

/** Local only: how much Claude wrote today, per repo. Output tokens, from the transcripts. */
export function ClaudeToday({ usage }: { usage: { repo: string; tokens: number; sessions: number }[] }) {
    if (!usage.length) return null;
    const total = usage.reduce((sum, u) => sum + u.tokens, 0);
    return (
        <Section title="Claude today" aside={<span className="flex gap-4"><span title={`${num.format(total)} tokens`}>{short.format(total)} tokens written</span><Link className={link} href="/claude">Sessions</Link></span>}>
            <ul className={`${panel} text-sm tabular-nums`}>
                {usage.map(u => (
                    <li key={u.repo} className="flex items-center justify-between gap-4 px-4 py-2">
                        <span className="flex min-w-0 items-center gap-3"><ProjectIcon project={u.repo} /><span className="truncate">{u.repo}</span></span>
                        <span className="shrink-0 text-fg-muted">{n(u.sessions, 'session')}, <span title={`${num.format(u.tokens)} tokens`}>{short.format(u.tokens)}</span> tokens</span>
                    </li>
                ))}
            </ul>
        </Section>
    );
}
