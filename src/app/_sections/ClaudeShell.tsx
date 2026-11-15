import { needsYou, type Session, type SessionState } from '@/lib/claude';
import { ago } from '@/lib/today';
import { ClaudePanes, SessionLink } from './ClaudePanes';
import { NewSession } from './NewSession';
import { ProjectIcon } from './ProjectIcon';

const DOT: Record<SessionState, string> = { question: 'bg-warn', blocked: 'bg-warn', waiting: 'bg-warn', working: 'bg-ok animate-shimmer', stopped: 'bg-fg-muted' };
const SAID: Record<SessionState, string> = { question: 'Asking you', blocked: 'Waiting for your OK', waiting: 'Your turn', working: 'Working', stopped: 'Stopped' };

/**
 * The Claude page's frame, from its layout so it stays put while you switch sessions: every session from the last two
 * days down the side (the ones that need you first), and the open one beside it. On a phone the list and a session are
 * separate screens. Fills the height under the nav, so the conversation scrolls inside it and the reply box stays at the bottom.
 */
export function ClaudeShell({ sessions, repos, children }: { sessions: Session[]; repos: string[]; children: React.ReactNode }) {
    const list = (
        <>
            <h1 className="text-lg font-semibold">Claude</h1>
            <NewSession repos={repos} />
            <ul className="min-h-0 flex-1 overflow-y-auto">
                {sessions.map(s => (
                    <li key={s.id}>
                        <SessionLink id={s.id}>
                            <ProjectIcon project={s.repo} className="mt-0.5 size-5 text-[9px]" />
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{s.title}</span>
                                <span className="flex items-center gap-2 text-fg-muted">
                                    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[s.state]}`} />
                                    <span className="truncate">{s.repo}, {needsYou(s) ? SAID[s.state] : s.state === 'working' ? 'Working' : ago(s.at)}</span>
                                </span>
                            </span>
                        </SessionLink>
                    </li>
                ))}
                {!sessions.length && <li className="px-2 py-2 text-sm text-fg-muted">No sessions in the last two days</li>}
            </ul>
        </>
    );
    return <ClaudePanes list={list}>{children}</ClaudePanes>;
}
