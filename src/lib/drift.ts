import { OWNER, type Project } from '../../lighthouse.config';
import { TRACKED, type RepoStatus } from './github';

/** The version a spec asks for at least: "^16.4.5" is [16, 4, 5], "^4" is [4], ">=24 <25" is [24]. */
export function floor(spec: string): number[] {
    return spec.match(/\d+(?:\.\d+){0,2}/)?.[0].split('.').map(Number) ?? [];
}

/** Negative when a is older. Only the parts both give are compared, so "^4" is not behind 4.3.4. */
function compare(a: number[], b: number[]) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
}
// For picking the newest, a missing part counts as 0, so 4.3.4 beats a bare 4
const full = (v: number[]) => [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];

export type DriftRow = { project: string; repo: string; cells: Record<string, { spec: string; behind: boolean }>; issueHref: string | null };

/** Per package, the newest version any repo declares, and which repos ask for less. */
export function buildDrift(projects: Project[], repos: RepoStatus[]) {
    const labels = [...Object.keys(TRACKED), 'Node'].filter(l => repos.some(r => r?.versions[l]));
    const newest: Record<string, number[]> = {};
    for (const l of labels) for (const r of repos) {
        const v = r?.versions[l] && full(floor(r.versions[l]));
        if (v && (!newest[l] || compare(v, newest[l]) > 0)) newest[l] = v;
    }

    const rows: DriftRow[] = projects.flatMap((p, i) => {
        const r = repos[i];
        if (!r || !Object.keys(r.versions).length) return [];
        const cells: DriftRow['cells'] = {};
        const behind: string[] = [];
        for (const l of labels) {
            const spec = r.versions[l];
            if (!spec) continue;
            const old = compare(floor(spec), newest[l]) < 0;
            cells[l] = { spec, behind: old };
            if (old) behind.push(`- ${l}: ${spec}, newest in use ${newest[l].join('.')}`);
        }
        const issueHref = behind.length
            ? `https://github.com/${OWNER}/${p.repo}/issues/new?${new URLSearchParams({ title: `Update ${behind.length === 1 ? 'a dependency' : `${behind.length} dependencies`} to match the other repos`, body: `Behind the newest version used across the Checkwork repos (from Checkwork Lighthouse):\n\n${behind.join('\n')}` })}`
            : null;
        return [{ project: p.name, repo: p.repo, cells, issueHref }];
    });
    return { labels, newest: Object.fromEntries(labels.map(l => [l, newest[l].join('.')])), rows };
}
