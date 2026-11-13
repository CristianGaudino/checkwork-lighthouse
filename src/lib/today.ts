import { OWNER, type Project } from '../../lighthouse.config';
import type { PullRequest, RepoStatus } from './github';

/** One thing for the owner to do, worded as the action, linking to where it is done. */
export type Task = { project: string; level: 1 | 2; action: string; title?: string; detail: string; href: string };
export type Light = 'bad' | 'warn' | 'ok';
export type ProjectState = Project & { light: Light; repoStatus: RepoStatus };

const STALE_MS = 3 * 86_400_000;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function prTask(project: string, pr: PullRequest, now: number): Task | null {
    if (pr.draft) return null;
    const stale = now - Date.parse(pr.updatedAt) > STALE_MS;
    const detail = `${pr.author}, updated ${ago(pr.updatedAt, now)}${stale ? ', gone quiet' : ''}, ${CHECK_LABEL[pr.checks]}`;
    const base = { project, title: `#${pr.number} ${pr.title}`, detail, href: pr.url };
    if (pr.checks === 'failing') return { ...base, level: 1, action: 'Fix checks on' };
    if (pr.review === 'changes') return { ...base, level: 2, action: 'Update' };
    if (pr.review === 'approved' && pr.checks !== 'running') return { ...base, level: 2, action: 'Merge' };
    return { ...base, level: 2, action: 'Review' };
}

/** The to-do queue (worst first, then config order) and every project's light. */
export function buildBoard(projects: Project[], repos: RepoStatus[], now = Date.now()) {
    const tasks: Task[] = [];
    const states: ProjectState[] = projects.map((p, i) => {
        const r = repos[i] ?? null;
        const mine: Task[] = [];
        if (!r) {
            mine.push({ project: p.name, level: 1, action: 'Check access to', title: p.repo, detail: 'Renamed, or the token cannot see it', href: `https://github.com/${OWNER}/${p.repo}` });
        } else {
            for (const pr of r.prs) { const t = prTask(p.name, pr, now); if (t) mine.push(t); }
            const n = r.release?.unreleased ?? 0;
            if (r.release && n) {
                const when = r.release.date ? `, ${ago(r.release.date, now)}` : '';
                mine.push({ project: p.name, level: 2, action: `Release ${plural(n, 'commit')}`, detail: `On main since ${r.release.tag}${when}`, href: `https://github.com/${OWNER}/${p.repo}/compare/${r.release.tag}...main` });
            }
        }
        tasks.push(...mine);
        const worst = Math.min(3, ...mine.map(t => t.level));
        return { ...p, repoStatus: r, light: worst === 1 ? 'bad' : worst === 2 ? 'warn' : 'ok' };
    });
    // Array.prototype.sort is stable, so equal levels keep the config's order
    return { tasks: tasks.sort((a, b) => a.level - b.level), projects: states };
}

const rtf = new Intl.RelativeTimeFormat('en-IE', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]];

/** "3 days ago", "yesterday", "just now". */
export function ago(iso: string, now = Date.now()): string {
    const ms = Date.parse(iso) - now;
    for (const [unit, size] of UNITS) if (Math.abs(ms) >= size) return rtf.format(Math.round(ms / size), unit);
    return 'just now';
}

const CHECK_LABEL: Record<PullRequest['checks'], string> = { passing: 'checks pass', failing: 'checks fail', running: 'checks running', none: 'no checks' };
