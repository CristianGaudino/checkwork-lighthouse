import { needsYou, type Session, type SessionState } from './claude';
import type { Task } from './today';

/**
 * What needs the owner right now, as small keyed items for the browser: the tab title counts them, and a new key of a
 * kind the owner turned on becomes a desktop notification. A key changes when the thing changes, so it fires once.
 */
export type BeatKind = 'down' | 'main' | 'pr' | 'claude' | 'other';
export type Beat = { key: string; kind: BeatKind; title: string; body: string; href: string };

const SAID: Partial<Record<SessionState, string>> = { question: 'Asking you something', blocked: 'Waiting for your OK, or a long step', waiting: 'Your turn' };

const kindOf = (t: Task): BeatKind => (t.incidentRepo ? 'down' : t.action === 'Fix main' ? 'main' : t.pr?.canMerge ? 'pr' : 'other');

export function beats(tasks: Task[], sessions: Session[] | null): Beat[] {
    return [
        ...tasks.map(t => {
            const kind = kindOf(t);
            const head = [t.action, t.title].filter(Boolean).join(' ');
            // A mergeable PR's key carries its commit, so a new push that passes again says so again
            return { key: `${t.project} ${head}${t.pr ? ` ${t.pr.sha}` : ''}`, kind, title: kind === 'pr' ? `Ready to merge: ${t.title}` : head, body: `${t.project}. ${t.detail}`, href: t.href };
        }),
        ...(sessions ?? []).filter(s => needsYou(s)).map(s => ({
            key: `claude ${s.id} ${s.state} ${s.at}`, kind: 'claude' as const,
            title: `${s.repo}: ${SAID[s.state]}`, body: s.questions[0]?.text ?? s.title, href: `/claude/${s.id}`,
        })),
    ];
}
