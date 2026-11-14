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
    commits: z.object({ nodes: z.array(z.object({ commit: z.object({ oid: z.string().optional(), statusCheckRollup: z.object({ state: z.string() }).nullable() }) })) }),
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
    // null when the repo has no workflows folder; a file's text is null when GitHub calls it binary
    workflows: z.object({ entries: z.array(z.object({ name: z.string(), object: z.object({ text: z.string().nullable().optional() }).nullable().optional() })) }).nullable().optional(),
    wrangler: z.object({ text: z.string().nullable() }).nullable().optional(),
    main: z.object({
        history: z.object({ nodes: z.array(z.object({ committedDate: z.string(), messageHeadline: z.string() })) }),
        oid: z.string().optional(),
        statusCheckRollup: z.object({ state: z.string() }).nullable().optional(),
    }).nullable().optional(),
}).nullable();

/** The packages the version table compares, by their label. */
export const TRACKED = { Next: 'next', React: 'react', OpenNext: '@opennextjs/cloudflare', Wrangler: 'wrangler', Tailwind: 'tailwindcss', TypeScript: 'typescript', Drizzle: 'drizzle-orm', Zod: 'zod', Vitest: 'vitest', Playwright: '@playwright/test' } as const;

/** The Worker's name from wrangler.jsonc: the first top-level "name" (bindings' names sit deeper, after it). */
export const workerName = (text: string | null | undefined) => text?.match(/^\s*"name"\s*:\s*"([^"]+)"/m)?.[1] ?? null;

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

/** `sha`: the head commit, so a merge only goes through if nothing was pushed since the page showed it. */
export type PullRequest = {
    number: number; title: string; url: string; draft: boolean; updatedAt: string; author: string; sha: string | null;
    review: 'approved' | 'changes' | 'waiting' | 'none';
    checks: 'passing' | 'failing' | 'running' | 'none';
};
/**
 * `releasesDeploy`: the repo has a Release workflow, so commits on main wait for a release to reach the site.
 * `checksPrs`: a workflow runs on pull requests. `deploysWorker`: a workflow runs `wrangler deploy`.
 * `main`: when main's newest commit and its recent merges landed, newest first, to tell what the live Worker is missing,
 * and how the newest commit's checks went ('none' too when the token can't see them: see fetchRuns).
 */
export type RepoStatus = {
    prs: PullRequest[]; release: { tag: string; date: string | null; unreleased: number | null } | null; releasesDeploy: boolean; checksPrs: boolean; deploysWorker: boolean; isPrivate: boolean;
    worker: string | null; versions: Record<string, string>; main: { sha: string | null; head: string | null; merges: string[]; checks: PullRequest['checks'] };
} | null;

// Rollup states: SUCCESS, FAILURE, ERROR, PENDING, EXPECTED
const CHECKS: Record<string, PullRequest['checks']> = { SUCCESS: 'passing', FAILURE: 'failing', ERROR: 'failing', PENDING: 'running', EXPECTED: 'running' };
const REVIEW = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes', REVIEW_REQUIRED: 'waiting' } as const;

// shortcut: the first 20 open PRs per repo, so a repo with more undercounts. Add totalCount if a Dependabot burst ever gets there.
const FIELDS = `
  isPrivate
  pullRequests(states: OPEN, first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
    nodes { number title url isDraft updatedAt author { login } reviewDecision commits(last: 1) { nodes { commit { oid statusCheckRollup { state } } } } }
  }
  refs(refPrefix: "refs/tags/", first: 1, orderBy: {field: TAG_COMMIT_DATE, direction: DESC}) {
    nodes { name compare(headRef: "main") { aheadBy } target { ... on Commit { committedDate } ... on Tag { target { ... on Commit { committedDate } } } } }
  }
  pkg: object(expression: "HEAD:package.json") { ... on Blob { text } }
  workflows: object(expression: "HEAD:.github/workflows") { ... on Tree { entries { name object { ... on Blob { text } } } } }
  wrangler: object(expression: "HEAD:wrangler.jsonc") { ... on Blob { text } }
  main: object(expression: "main") { ... on Commit { oid statusCheckRollup { state } history(first: 30) { nodes { committedDate messageHeadline } } } }`;

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
    const workflows = repo.workflows?.entries ?? [];
    return {
        prs: repo.pullRequests.nodes.map(pr => ({
            number: pr.number,
            title: pr.title,
            url: pr.url,
            draft: pr.isDraft,
            updatedAt: pr.updatedAt,
            author: pr.author?.login ?? 'ghost',
            sha: pr.commits.nodes[0]?.commit.oid ?? null,
            review: pr.reviewDecision ? REVIEW[pr.reviewDecision] : 'none',
            checks: CHECKS[pr.commits.nodes[0]?.commit.statusCheckRollup?.state ?? ''] ?? 'none',
        })),
        release: tag ? { tag: tag.name, date: tag.target.committedDate ?? tag.target.target?.committedDate ?? null, unreleased: tag.compare?.aheadBy ?? null } : null,
        releasesDeploy: workflows.some(w => w.name === 'release.yml'),
        checksPrs: workflows.some(w => /^\s*pull_request\b|^on:.*\bpull_request\b/m.test(w.object?.text ?? '')),
        deploysWorker: workflows.some(w => /wrangler(-action|\s+deploy)/.test(w.object?.text ?? '')),
        isPrivate: repo.isPrivate ?? true,
        worker: workerName(repo.wrangler?.text),
        versions: readVersions(repo.pkg?.text),
        main: {
            sha: repo.main?.oid ?? null,
            head: repo.main?.history.nodes[0]?.committedDate ?? null,
            // Only GitHub's own merge commits: a branch that merged main into itself also has two parents
            merges: repo.main?.history.nodes.filter(c => c.messageHeadline.startsWith('Merge pull request')).map(c => c.committedDate) ?? [],
            checks: CHECKS[repo.main?.statusCheckRollup?.state ?? ''] ?? 'none',
        },
    };
}

/** One GitHub GraphQL request. Throws on an HTTP error; `data` is undefined when GitHub refused the whole query. */
export async function githubGraphql(token: string, query: string): Promise<Record<string, unknown> | undefined> {
    const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'lighthouse' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GitHub: ${res.status}`);
    return ((await res.json()) as { data?: Record<string, unknown> }).data;
}

/** Status per project, in the same order. Throws when GitHub can't be reached or refuses the token; a repo GitHub can't find comes back null. */
export async function fetchRepos(projects: Project[], token: string): Promise<RepoStatus[]> {
    // A repo that is missing or not visible to the token comes back as data null plus an error; the others still load
    const data = await githubGraphql(token, buildQuery(projects));
    if (!data) throw new Error('GitHub: no data');
    return projects.map((_, i) => parseRepo(data[`r${i}`] ?? null));
}

const Runs = z.object({ workflow_runs: z.array(z.object({ status: z.string().nullable(), conclusion: z.string().nullable() })) });
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);

/** How a commit's workflow runs went: any failure fails it, then any still going means running. */
export function runsChecks(runs: z.infer<typeof Runs>['workflow_runs']): PullRequest['checks'] {
    if (!runs.length) return 'none';
    if (runs.some(r => FAILED.has(r.conclusion ?? ''))) return 'failing';
    return runs.some(r => r.status !== 'completed') ? 'running' : 'passing';
}

/**
 * How one commit's checks went, from its Actions runs, for where GraphQL gave none: a fine-grained token can't read
 * check results on a private repo, but it can read Actions. Throws when GitHub refuses.
 */
export async function fetchRuns(token: string, repo: string, sha: string): Promise<PullRequest['checks']> {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/actions/runs?head_sha=${sha}&per_page=20`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'lighthouse' },
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GitHub Actions runs for ${repo}: ${res.status}`);
    return runsChecks(Runs.parse(await res.json()).workflow_runs);
}
