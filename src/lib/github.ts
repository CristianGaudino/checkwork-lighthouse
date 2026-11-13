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
const Repo = z.object({
    isPrivate: z.boolean().optional(),
    pullRequests: z.object({ nodes: z.array(Pr) }),
    refs: z.object({ nodes: z.array(Tag) }),
    pkg: z.object({ text: z.string().nullable() }).nullable().optional(), // null when the repo has no package.json at its root
    releaseWorkflow: z.object({ id: z.string() }).nullable().optional(),
}).nullable();

/** The packages the version table compares, by their label. */
export const TRACKED = { Next: 'next', React: 'react', OpenNext: '@opennextjs/cloudflare', Wrangler: 'wrangler', Tailwind: 'tailwindcss', TypeScript: 'typescript', Drizzle: 'drizzle-orm', Zod: 'zod', Vitest: 'vitest', Playwright: '@playwright/test' } as const;

/** Declared versions by label (as written, like "^16.4.5"), plus Node from `engines`. A missing or broken package.json gives {}. */
export function readVersions(text: string | null | undefined): Record<string, string> {
    let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; engines?: { node?: string } };
    try { pkg = JSON.parse(text ?? ''); } catch { return {}; }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const out: Record<string, string> = {};
    for (const [label, name] of Object.entries(TRACKED)) if (typeof deps[name] === 'string') out[label] = deps[name];
    if (typeof pkg.engines?.node === 'string') out.Node = pkg.engines.node;
    return out;
}

export type PullRequest = {
    number: number; title: string; url: string; draft: boolean; updatedAt: string; author: string;
    review: 'approved' | 'changes' | 'waiting' | 'none';
    checks: 'passing' | 'failing' | 'running' | 'none';
};
/** `releasesDeploy`: the repo has a Release workflow, so commits on main wait for a release to reach the site. */
export type RepoStatus = { prs: PullRequest[]; release: { tag: string; date: string | null; unreleased: number | null } | null; releasesDeploy: boolean; isPrivate: boolean; versions: Record<string, string> } | null;

// Rollup states: SUCCESS, FAILURE, ERROR, PENDING, EXPECTED
const CHECKS: Record<string, PullRequest['checks']> = { SUCCESS: 'passing', FAILURE: 'failing', ERROR: 'failing', PENDING: 'running', EXPECTED: 'running' };
const REVIEW = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes', REVIEW_REQUIRED: 'waiting' } as const;

// shortcut: the first 20 open PRs per repo, so a repo with more undercounts. Add totalCount if a Dependabot burst ever gets there.
const FIELDS = `
  isPrivate
  pullRequests(states: OPEN, first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
    nodes { number title url isDraft updatedAt author { login } reviewDecision commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
  }
  refs(refPrefix: "refs/tags/", first: 1, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
    nodes { name compare(headRef: "main") { aheadBy } target { ... on Commit { committedDate } ... on Tag { target { ... on Commit { committedDate } } } } }
  }
  pkg: object(expression: "HEAD:package.json") { ... on Blob { text } }
  releaseWorkflow: object(expression: "HEAD:.github/workflows/release.yml") { id }`;

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
        releasesDeploy: Boolean(repo.releaseWorkflow),
        isPrivate: repo.isPrivate ?? true,
        versions: readVersions(repo.pkg?.text),
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
