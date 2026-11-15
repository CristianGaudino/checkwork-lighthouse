import Link from 'next/link';
import { needsYou, type Session, type SessionState } from '@/lib/claude';
import { ago } from '@/lib/today';
import { NewSession } from './NewSession';
import { ProjectIcon } from './ProjectIcon';

const DOT: Record<SessionState, string> = { question: 'bg-warn', blocked: 'bg-warn', waiting: 'bg-warn', working: 'bg-ok', stopped: 'bg-fg-muted' };
const SAID: Record<SessionState, string> = { question: 'Asking you', blocked: 'Waiting for your OK', waiting: 'Your turn', working: 'Working', stopped: 'Stopped' };

/**
 * The Claude page's frame: every session from the last two days down the side (the ones that need you first), and the
 * open one beside it. On a phone the list and a session are separate screens. Fills the height under the nav, so the
 * conversation scrolls inside it and the reply box stays at the bottom.
 */
export function ClaudeShell({ sessions, repos, current, children }: { sessions: Session[]; repos: string[]; current?: string; children: React.ReactNode }) {
    return (
        <div className="grid h-[calc(100dvh-12rem)] min-h-96 gap-6 lg:h-[calc(100dvh-6.5rem)] lg:grid-cols-[18rem_minmax(0,1fr)]">
            <aside className={`min-h-0 flex-col gap-3 ${current ? 'hidden lg:flex' : 'flex'}`}>
                <h1 className="text-lg font-semibold">Claude</h1>
                <NewSession repos={repos} />
                <ul className="min-h-0 flex-1 overflow-y-auto">
                    {sessions.map(s => (
                        <li key={s.id}>
                            <Link
                                href={`/claude/${s.id}`}
                                aria-current={s.id === current ? 'page' : undefined}
                                className="grid grid-cols-[auto_1fr] gap-x-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-surface/60 aria-[current=page]:bg-surface"
                            >
                                <ProjectIcon project={s.repo} className="mt-0.5 size-5 text-[9px]" />
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{s.title}</span>
                                    <span className="flex items-center gap-2 text-fg-muted">
                                        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[s.state]}`} />
                                        <span className="truncate">{s.repo}, {needsYou(s) ? SAID[s.state] : s.state === 'working' ? 'Working' : ago(s.at)}</span>
                                    </span>
                                </span>
                            </Link>
                        </li>
                    ))}
                    {!sessions.length && <li className="px-2 py-2 text-sm text-fg-muted">No sessions in the last two days</li>}
                </ul>
            </aside>
            <section className={`min-h-0 flex-col ${current ? 'flex' : 'hidden lg:flex'}`}>
                {current && <Link href="/claude" className="mb-2 text-sm text-fg-muted lg:hidden">All sessions</Link>}
                {children}
            </section>
        </div>
    );
}
