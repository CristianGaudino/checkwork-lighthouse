import type { Project } from '../../lighthouse.config';
import type { PullRequest, RepoStatus } from './github';

export type Row = Project & { repoStatus: RepoStatus; attention: number; reasons: string[] };

const STALE_MS = 3 * 86_400_000;

/** What needs the owner, worst first. Lower `attention` sorts higher; ties keep the config's order. */
export function buildRows(projects: Project[], repos: RepoStatus[], now = Date.now()): Row[] {
    const rows = projects.map((p, i) => {
        const r = repos[i] ?? null;
        const reasons: string[] = [];
        let attention = 3;
        const flag = (level: number, reason: string) => { attention = Math.min(attention, level); reasons.push(reason); };
        if (!r) flag(1, 'Not found on GitHub, or the token cannot see it');
        else {
            const live = r.prs.filter(pr => !pr.draft);
            const failing = live.filter(pr => pr.checks === 'failing').length;
            if (failing) flag(1, `${failing} PR${failing > 1 ? 's' : ''} failing checks`);
            const waiting = live.filter(pr => pr.review === 'waiting' || pr.review === 'none').length;
            if (waiting) flag(2, `${waiting} PR${waiting > 1 ? 's' : ''} to review`);
            const stale = live.filter(pr => now - Date.parse(pr.updatedAt) > STALE_MS).length;
            if (stale) flag(2, `${stale} stale PR${stale > 1 ? 's' : ''}`);
            const unreleased = r.release?.unreleased ?? 0;
            if (unreleased) flag(2, `${unreleased} commit${unreleased > 1 ? 's' : ''} not released`);
        }
        return { ...p, repoStatus: r, attention, reasons };
    });
    return rows.map((row, i) => ({ row, i })).sort((a, b) => a.row.attention - b.row.attention || a.i - b.i).map(x => x.row);
}

const rtf = new Intl.RelativeTimeFormat('en-IE', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]];

/** "3 days ago", "yesterday", "just now". */
export function ago(iso: string, now = Date.now()): string {
    const ms = Date.parse(iso) - now;
    for (const [unit, size] of UNITS) if (Math.abs(ms) >= size) return rtf.format(Math.round(ms / size), unit);
    return 'just now';
}

export const CHECK_LABEL: Record<PullRequest['checks'], string> = { passing: 'Checks pass', failing: 'Checks fail', running: 'Checks running', none: 'No checks' };
export const REVIEW_LABEL: Record<PullRequest['review'], string> = { approved: 'Approved', changes: 'Changes asked', waiting: 'Needs review', none: 'No review' };
