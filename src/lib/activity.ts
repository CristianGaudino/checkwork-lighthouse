import { z } from 'zod';
import { OWNER, type Project } from '../../lighthouse.config';
import { githubGraphql } from './github';
import type { LiveState } from './live';
import type { Uptime } from './uptime';

/** One thing that happened, newest first on the page. `repo`: whose icon it shows. */
export type Event = { at: string; repo: string; kind: 'merged' | 'opened' | 'issue' | 'release' | 'failed' | 'deployed' | 'down' | 'up'; text: string; href: string };

const WINDOW_MS = 7 * 86_400_000;
const MAX = 80;
const DEPENDABOT = 'dependabot';

const Pr = z.object({ number: z.number(), title: z.string(), url: z.string(), author: z.object({ login: z.string() }).nullable() });
const Repo = z.object({
    merged: z.object({ nodes: z.array(Pr.extend({ mergedAt: z.string().nullable() })) }),
    opened: z.object({ nodes: z.array(Pr.extend({ createdAt: z.string() })) }),
    issues: z.object({ nodes: z.array(Pr.extend({ createdAt: z.string() })) }),
    releases: z.object({ nodes: z.array(z.object({ name: z.string().nullable(), tagName: z.string(), url: z.string(), publishedAt: z.string().nullable() })) }),
}).nullable();
const Runs = z.object({ workflow_runs: z.array(z.object({ name: z.string().nullable(), head_branch: z.string().nullable(), html_url: z.string(), created_at: z.string(), conclusion: z.string().nullable() })) });
export type FailedRun = z.infer<typeof Runs>['workflow_runs'][number];

const FIELDS = `
  merged: pullRequests(states: MERGED, first: 10, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { number title url mergedAt author { login } } }
  opened: pullRequests(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { number title url createdAt author { login } } }
  issues(first: 10, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { number title url createdAt author { login } } }
  releases(first: 5, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { name tagName url publishedAt } }`;

/** Merges, new PRs and issues, and releases for every repo, in one GraphQL request. null for a repo GitHub didn't send. */
export async function fetchHistory(token: string, projects: Project[]): Promise<unknown[]> {
    const data = await githubGraphql(token, `{ ${projects.map((p, i) => `h${i}: repository(owner: ${JSON.stringify(OWNER)}, name: ${JSON.stringify(p.repo)}) { ${FIELDS} }`).join('\n')} }`);
    if (!data) throw new Error('GitHub: no history');
    return projects.map((_, i) => data[`h${i}`] ?? null);
}

/** A repo's latest failed workflow runs. Throws when GitHub refuses. */
export async function fetchFailedRuns(token: string, repo: string): Promise<FailedRun[]> {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/actions/runs?status=failure&per_page=5`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'lighthouse' },
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GitHub failed runs for ${repo}: ${res.status}`);
    return Runs.parse(await res.json()).workflow_runs;
}

type Site = { p: Project & { uptime?: Uptime | null }; live: LiveState | null };

/**
 * The last week across every project, newest first: merges, new PRs (not Dependabot's) and issues, releases, failed
 * runs, deploys, and a site going down or coming back (from how long the monitor has been in its state).
 */
export function buildActivity(sites: Site[], history: unknown[], failed: (FailedRun[] | null)[], now = Date.now()): Event[] {
    const events = sites.flatMap(({ p, live }, i): Event[] => {
        const parsed = Repo.safeParse(history[i] ?? null);
        if (!parsed.success) console.error('Unexpected GitHub history', parsed.error.issues);
        const h = parsed.data;
        const who = (a: { login: string } | null) => (a && a.login !== OWNER ? ` by ${a.login}` : '');
        const u = p.uptime;
        const changed = u?.seconds != null ? new Date(now - u.seconds * 1000).toISOString() : null;
        return [
            ...(h?.merged.nodes ?? []).flatMap(pr => (pr.mergedAt ? [{ at: pr.mergedAt, repo: p.repo, kind: 'merged' as const, text: `Merged #${pr.number} ${pr.title}${who(pr.author)}`, href: pr.url }] : [])),
            ...(h?.opened.nodes ?? []).filter(pr => pr.author?.login !== DEPENDABOT).map(pr => ({ at: pr.createdAt, repo: p.repo, kind: 'opened' as const, text: `Opened #${pr.number} ${pr.title}${who(pr.author)}`, href: pr.url })),
            ...(h?.issues.nodes ?? []).map(is => ({ at: is.createdAt, repo: p.repo, kind: 'issue' as const, text: `New issue #${is.number} ${is.title}${who(is.author)}`, href: is.url })),
            ...(h?.releases.nodes ?? []).flatMap(r => (r.publishedAt ? [{ at: r.publishedAt, repo: p.repo, kind: 'release' as const, text: `Released ${r.name || r.tagName}`, href: r.url }] : [])),
            ...(failed[i] ?? []).map(r => ({ at: r.created_at, repo: p.repo, kind: 'failed' as const, text: `${r.name ?? 'A workflow'} failed${r.head_branch ? ` on ${r.head_branch}` : ''}`, href: r.html_url })),
            ...(live && live.state !== 'deploying' ? [{ at: live.since, repo: p.repo, kind: 'deployed' as const, text: 'Deployed', href: `https://${p.site}` }] : []),
            ...(changed && u?.state === 'down' ? [{ at: changed, repo: p.repo, kind: 'down' as const, text: `${p.site.replace(/^www\./, '')} went down`, href: `https://dashboard.uptimerobot.com/monitors/${u.id}` }] : []),
            // Up for under a week means it changed state lately: most likely it was down before
            ...(changed && u?.state === 'up' ? [{ at: changed, repo: p.repo, kind: 'up' as const, text: `${p.site.replace(/^www\./, '')} came back up`, href: `https://dashboard.uptimerobot.com/monitors/${u.id}` }] : []),
        ];
    });
    return events.filter(e => now - Date.parse(e.at) < WINDOW_MS).sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX);
}
