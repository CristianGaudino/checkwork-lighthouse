import { z } from 'zod';
import { OWNER, type Project } from '../../lighthouse.config';

const Pr = z.object({
    number: z.number(),
    title: z.string(),
    url: z.string(),
    isDraft: z.boolean(),
    updatedAt: z.string(),
    author: z.object({ login: z.string() }).nullable(), // null when the account was deleted
    reviewDecision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']).nullable(),
    commits: z.object({ nodes: z.array(z.object({ commit: z.object({ statusCheckRollup: z.object({ state: z.string() }).nullable() }) })) }),
});
const Tag = z.object({
    name: z.string(),
    compare: z.object({ aheadBy: z.number() }).nullable(),
    // A lightweight tag points at the commit; an annotated one at a Tag that points at it
    target: z.object({ committedDate: z.string().optional(), target: z.object({ committedDate: z.string().optional() }).optional() }),
});
const Repo = z.object({ pullRequests: z.object({ nodes: z.array(Pr) }), refs: z.object({ nodes: z.array(Tag) }) }).nullable();

export type PullRequest = {
    number: number; title: string; url: string; draft: boolean; updatedAt: string; author: string;
    review: 'approved' | 'changes' | 'waiting' | 'none';
    checks: 'passing' | 'failing' | 'running' | 'none';
};
export type RepoStatus = { prs: PullRequest[]; release: { tag: string; date: string | null; unreleased: number | null } | null } | null;

// Rollup states: SUCCESS, FAILURE, ERROR, PENDING, EXPECTED
const CHECKS: Record<string, PullRequest['checks']> = { SUCCESS: 'passing', FAILURE: 'failing', ERROR: 'failing', PENDING: 'running', EXPECTED: 'running' };
const REVIEW = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes', REVIEW_REQUIRED: 'waiting' } as const;

const FIELDS = `
  pullRequests(states: OPEN, first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
    nodes { number title url isDraft updatedAt author { login } reviewDecision commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
  }
  refs(refPrefix: "refs/tags/", first: 1, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
    nodes { name compare(headRef: "main") { aheadBy } target { ... on Commit { committedDate } ... on Tag { target { ... on Commit { committedDate } } } } }
  }`;

/** One GraphQL query covers every repo (aliases r0, r1...), so the page costs one GitHub request however many projects there are. */
export const buildQuery = (projects: Project[]) =>
    `{ ${projects.map((p, i) => `r${i}: repository(owner: ${JSON.stringify(OWNER)}, name: ${JSON.stringify(p.repo)}) { ${FIELDS} }`).join('\n')} }`;

/** null when GitHub sent nothing for the repo, or a shape we don't know (logged), so one odd repo never blanks the rest. */
export function parseRepo(raw: unknown): RepoStatus {
    const parsed = Repo.safeParse(raw);
    if (!parsed.success) console.error('Unexpected GitHub repo data', parsed.error.issues);
    const repo = parsed.data;
    if (!repo) return null;
    const tag = repo.refs.nodes[0];
    return {
        prs: repo.pullRequests.nodes.map(pr => ({
            number: pr.number,
            title: pr.title,
            url: pr.url,
            draft: pr.isDraft,
            updatedAt: pr.updatedAt,
            author: pr.author?.login ?? 'ghost',
            review: pr.reviewDecision ? REVIEW[pr.reviewDecision] : 'none',
            checks: CHECKS[pr.commits.nodes[0]?.commit.statusCheckRollup?.state ?? ''] ?? 'none',
        })),
        release: tag ? { tag: tag.name, date: tag.target.committedDate ?? tag.target.target?.committedDate ?? null, unreleased: tag.compare?.aheadBy ?? null } : null,
    };
}

/** Status per project, in the same order. Throws when GitHub can't be reached or refuses the token; a repo GitHub can't find comes back null. */
export async function fetchRepos(projects: Project[], token: string): Promise<RepoStatus[]> {
    const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'lighthouse' },
        body: JSON.stringify({ query: buildQuery(projects) }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GitHub: ${res.status}`);
    // A repo that is missing or not visible to the token comes back as data null plus an error; the others still load
    const { data } = (await res.json()) as { data?: Record<string, unknown> };
    if (!data) throw new Error('GitHub: no data');
    return projects.map((_, i) => parseRepo(data[`r${i}`] ?? null));
}
