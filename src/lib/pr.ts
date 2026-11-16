import { z } from 'zod';
import { OWNER } from '../../lighthouse.config';
import { checkState, githubGraphql, githubRest } from './github';

/** One PR in full, for its page (#57): what changed, how its checks went, what reviewers said, and a preview if one was deployed. */
export type Check = { name: string; state: 'passing' | 'failing' | 'running' | 'skipped'; href: string | null };
export type PrDetail = {
    number: number; title: string; url: string; body: string; author: string; draft: boolean; state: string; branch: string; sha: string | null;
    additions: number; deletions: number; files: { path: string; additions: number; deletions: number; change: string }[]; moreFiles: number;
    checks: Check[] | null; comments: { author: string; at: string; body: string; state: string | null; url: string }[];
};

const who = z.object({ login: z.string() }).nullable();
const Context = z.union([
    z.object({ __typename: z.literal('CheckRun'), name: z.string(), status: z.string(), conclusion: z.string().nullable(), detailsUrl: z.string().nullable() }),
    z.object({ __typename: z.literal('StatusContext'), context: z.string(), state: z.string(), targetUrl: z.string().nullable() }),
]);
const Pr = z.object({
    number: z.number(), title: z.string(), url: z.string(), body: z.string(), isDraft: z.boolean(), state: z.string(), headRefName: z.string(),
    additions: z.number(), deletions: z.number(), changedFiles: z.number(), author: who,
    files: z.object({ nodes: z.array(z.object({ path: z.string(), additions: z.number(), deletions: z.number(), changeType: z.string() })) }).nullable(),
    commits: z.object({ nodes: z.array(z.object({ commit: z.object({ oid: z.string(), statusCheckRollup: z.object({ contexts: z.object({ nodes: z.array(Context.or(z.object({}))) }) }).nullable() }) })) }),
    reviews: z.object({ nodes: z.array(z.object({ author: who, state: z.string(), body: z.string(), submittedAt: z.string().nullable(), url: z.string() })) }),
    comments: z.object({ nodes: z.array(z.object({ author: who, body: z.string(), createdAt: z.string(), url: z.string() })) }),
}).nullable();

const query = (repo: string, number: number) => `{ repository(owner: ${JSON.stringify(OWNER)}, name: ${JSON.stringify(repo)}) { pullRequest(number: ${number}) {
  number title url body isDraft state headRefName additions deletions changedFiles author { login }
  files(first: 100) { nodes { path additions deletions changeType } }
  commits(last: 1) { nodes { commit { oid statusCheckRollup { contexts(first: 50) { nodes { __typename
    ... on CheckRun { name status conclusion detailsUrl } ... on StatusContext { context state targetUrl } } } } } } }
  reviews(last: 20) { nodes { author { login } state body submittedAt url } }
  comments(last: 20) { nodes { author { login } body createdAt url } }
} } }`;

/** Separate from the fetch so it can be tested. null when GitHub has no such PR. */
export function parsePr(raw: unknown): PrDetail | null {
    const pr = Pr.parse(raw);
    if (!pr) return null;
    const commit = pr.commits.nodes[0]?.commit;
    const contexts = (commit?.statusCheckRollup?.contexts.nodes ?? []).filter((c): c is z.infer<typeof Context> => '__typename' in c);
    const files = pr.files?.nodes ?? [];
    return {
        number: pr.number, title: pr.title, url: pr.url, body: pr.body, author: pr.author?.login ?? 'ghost', draft: pr.isDraft, state: pr.state, branch: pr.headRefName, sha: commit?.oid ?? null,
        additions: pr.additions, deletions: pr.deletions, moreFiles: Math.max(0, pr.changedFiles - files.length),
        files: files.map(f => ({ path: f.path, additions: f.additions, deletions: f.deletions, change: f.changeType.toLowerCase() })),
        // null: GitHub gave none, which on a private repo can mean the token can't read them (see fetchActionChecks)
        checks: contexts.length ? contexts.map(c => (c.__typename === 'CheckRun'
            ? { name: c.name, state: checkState(c.status, c.conclusion), href: c.detailsUrl }
            : { name: c.context, state: checkState(c.state, null), href: c.targetUrl })) : null,
        // Reviews and comments together, oldest first; a review with no words (a bare approval) still says so
        comments: [
            ...pr.reviews.nodes.filter(r => r.body || r.state !== 'COMMENTED').map(r => ({ author: r.author?.login ?? 'ghost', at: r.submittedAt ?? '', body: r.body, state: r.state, url: r.url })),
            ...pr.comments.nodes.map(c => ({ author: c.author?.login ?? 'ghost', at: c.createdAt, body: c.body, state: null, url: c.url })),
        ].sort((a, b) => a.at.localeCompare(b.at)),
    };
}

/** Throws when GitHub can't be reached or refuses. */
export async function fetchPr(token: string, repo: string, number: number): Promise<PrDetail | null> {
    const data = await githubGraphql(token, query(repo, number));
    if (!data) throw new Error('GitHub: no data');
    return parsePr((data.repository as { pullRequest?: unknown } | null)?.pullRequest ?? null);
}

const Runs = z.object({ workflow_runs: z.array(z.object({ name: z.string().nullable(), status: z.string().nullable(), conclusion: z.string().nullable(), html_url: z.string() })) });
/** The commit's Actions runs as checks, for where GraphQL gave none (a fine-grained token on a private repo). */
export async function fetchActionChecks(token: string, repo: string, sha: string): Promise<Check[]> {
    const res = await githubRest(token, `${repo}/actions/runs?head_sha=${sha}&per_page=20`);
    if (!res.ok) throw new Error(`GitHub runs for ${repo}: ${res.status}`);
    return Runs.parse(await res.json()).workflow_runs.map(r => ({ name: r.name ?? 'Workflow', state: checkState(r.status ?? '', r.conclusion), href: r.html_url }));
}

const Deployments = z.array(z.object({ id: z.number(), environment: z.string() }));
const Statuses = z.array(z.object({ state: z.string(), environment_url: z.string().nullable().optional() }));
/** Where the commit was deployed outside production (a Vercel preview, say), or null. Asked apart: a token that can't read deployments costs only this. */
export async function fetchPreview(token: string, repo: string, sha: string): Promise<string | null> {
    const res = await githubRest(token, `${repo}/deployments?sha=${sha}&per_page=10`);
    if (!res.ok) throw new Error(`GitHub deployments for ${repo}: ${res.status}`);
    const preview = Deployments.parse(await res.json()).find(d => !/production/i.test(d.environment));
    if (!preview) return null;
    const statuses = await githubRest(token, `${repo}/deployments/${preview.id}/statuses?per_page=1`);
    if (!statuses.ok) throw new Error(`GitHub deployment statuses for ${repo}: ${statuses.status}`);
    const latest = Statuses.parse(await statuses.json())[0];
    return latest?.state === 'success' && latest.environment_url?.startsWith('https://') ? latest.environment_url : null;
}
