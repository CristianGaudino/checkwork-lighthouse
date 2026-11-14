import Link from 'next/link';
import { ago } from '@/lib/today';
import { needsYou, type Session, type SessionState } from '@/lib/claude';
import { resumeHref } from '@/lib/vscode';
import { ProjectIcon } from './ProjectIcon';
import { Reply } from './Reply';
import { ext, link, n, num, panel, Section } from './ui';

const STATE: Record<SessionState, { text: string; dot: string }> = {
    question: { text: 'Asking you', dot: 'bg-warn' },
    blocked: { text: 'Waiting for your OK, or on a long step', dot: 'bg-warn' },
    waiting: { text: 'Your turn', dot: 'bg-warn' },
    working: { text: 'Working', dot: 'bg-ok' },
    stopped: { text: 'Stopped mid-task', dot: 'bg-fg-muted' },
};

/**
 * Local only: Claude Code sessions from the last two days, the ones that need you first. A session asking you something
 * shows the question and its choices; you answer it in VS Code. Reply opens a session with your text typed in.
 * `more`: a link to the full list, for the Overview's short one.
 */
export function ClaudeSessions({ sessions, title = 'Claude sessions', more }: { sessions: Session[]; title?: string; more?: string }) {
    const waiting = sessions.filter(s => needsYou(s)).length;
    const aside = more ? <Link className={link} href={more}>All sessions</Link> : sessions.length ? (waiting ? `${waiting} need you` : 'None need you') : undefined;
    return (
        <Section id="claude" title={title} aside={aside}>
            {sessions.length ? (
                <ul className={panel}>
                    {sessions.map(s => (
                        <li key={s.id} className="grid gap-x-4 gap-y-2 px-4 py-3 text-sm sm:grid-cols-[minmax(9rem,12rem)_1fr_auto] sm:items-baseline">
                            <span className="flex items-center gap-3 font-medium">
                                <ProjectIcon project={s.repo} />
                                {s.repo}
                            </span>
                            <div className="min-w-0 pl-8 sm:pl-0">
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
                            <span className="flex flex-wrap gap-x-4 gap-y-1 pl-8 text-fg-muted sm:justify-end sm:pl-0">
                                {s.prUrl && <a {...ext} className={link} href={s.prUrl}>PR</a>}
                                {s.state === 'question'
                                    ? <a className={`${link} text-fg`} href={resumeHref(s.id)} title="Opens the session in Claude Code, in VS Code">Answer in VS Code</a>
                                    : <><Reply id={s.id} /><a className={link} href={resumeHref(s.id)} title="Opens the session in Claude Code, in VS Code">Open</a></>}
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
        <Section title="Claude today" aside={`${num.format(total)} tokens written`}>
            <ul className={`${panel} text-sm tabular-nums`}>
                {usage.map(u => (
                    <li key={u.repo} className="flex items-center justify-between gap-4 px-4 py-2">
                        <span className="flex min-w-0 items-center gap-3"><ProjectIcon project={u.repo} /><span className="truncate">{u.repo}</span></span>
                        <span className="text-fg-muted">{n(u.sessions, 'session')}, {num.format(u.tokens)} tokens</span>
                    </li>
                ))}
            </ul>
        </Section>
    );
}
