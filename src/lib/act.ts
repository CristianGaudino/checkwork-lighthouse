import { OWNER, PROJECTS } from '../../lighthouse.config';
import { FAILED } from './github';

/**
 * The few things Lighthouse can change on GitHub: approve a PR, merge it (or a batch of Dependabot PRs), open an issue,
 * re-run failed jobs and run a deploy workflow. They use GITHUB_WRITE_TOKEN,
 * a separate fine-grained token, so the token behind every page load stays read-only.
 */

export type ActResult = { ok?: string; href?: string; error?: string };
export const ISSUE_TYPES = ['Task', 'Bug', 'Feature'] as const;

/** Form input is untrusted: only a configured repo, a positive PR number, and a sane title get through. */
export function checkRepo(value: unknown): string | null {
    return PROJECTS.some(p => p.repo === value) ? (value as string) : null;
}
export function checkNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}
/** A full commit id, as GitHub gives it. */
export const checkSha = (value: unknown): string | null => (typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : null);
/** A workflow file name, as GitHub lists them in .github/workflows. */
export const checkWorkflow = (value: unknown): string | null => (typeof value === 'string' && /^[\w.-]+\.ya?ml$/.test(value) ? value : null);
/** Dependabot PRs as the form sends them, "12:sha,13:sha": every one must check out, or none go. At most 20, as the page lists. */
export function checkBatch(value: unknown): { number: number; sha: string }[] | null {
    if (typeof value !== 'string' || !value) return null;
    const prs = value.split(',').map(part => { const [n, sha] = part.split(':'); return { number: checkNumber(n), sha: checkSha(sha) }; });
    return prs.length <= 20 && prs.every(p => p.number && p.sha) ? (prs as { number: number; sha: string }[]) : null;
}
export function checkIssue(form: { title: unknown; body: unknown; type: unknown }) {
    const title = typeof form.title === 'string' ? form.title.trim() : '';
    const body = typeof form.body === 'string' ? form.body.trim() : '';
    if (!title || title.length > 256) return null;
    if (body.length > 20_000) return null;
    const type = (ISSUE_TYPES as readonly string[]).includes(form.type as string) ? (form.type as string) : 'Task';
    return { title, body, type };
}

async function github(token: string, method: string, path: string, body?: object) {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'lighthouse', 'x-github-api-version': '2022-11-28' },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; html_url?: string; number?: number; workflow_runs?: { id: number; conclusion: string | null }[] };
    return { status: res.status, json };
}

// GitHub explains a refusal in `message`; show it, since it says what to do (checks pending, not mergeable, no permission)
const refused = (status: number, message?: string) => ({ error: `GitHub refused (${status}): ${message ?? 'no reason given'}` });

export async function approve(token: string, repo: string, number: number): Promise<ActResult> {
    const r = await github(token, 'POST', `${repo}/pulls/${number}/reviews`, { event: 'APPROVE' });
    return r.status === 200 ? { ok: `Approved #${number}` } : refused(r.status, r.json.message);
}

export async function merge(token: string, repo: string, number: number, sha: string): Promise<ActResult> {
    // A merge commit, as every PR in these repos has been merged so far. `sha`: GitHub refuses (409) if the head moved since
    const r = await github(token, 'PUT', `${repo}/pulls/${number}/merge`, { merge_method: 'merge', sha });
    return r.status === 200 ? { ok: `Merged #${number}` } : refused(r.status, r.json.message);
}

export async function createIssue(token: string, repo: string, issue: { title: string; body: string; type: string }): Promise<ActResult> {
    const r = await github(token, 'POST', `${repo}/issues`, issue);
    return r.status === 201 ? { ok: `Opened #${r.json.number} in ${repo}`, href: r.json.html_url } : refused(r.status, r.json.message);
}

/** Runs the failed jobs of every failed workflow run on a commit again: the same runs that made the checks fail. */
export async function rerunFailed(token: string, repo: string, sha: string): Promise<ActResult> {
    const list = await github(token, 'GET', `${repo}/actions/runs?head_sha=${sha}&per_page=20`);
    if (list.status !== 200) return refused(list.status, list.json.message);
    const failed = (list.json.workflow_runs ?? []).filter(r => FAILED.has(r.conclusion ?? ''));
    if (!failed.length) return { error: 'No failed runs on that commit. They may already be running again.' };
    for (const run of failed) {
        const r = await github(token, 'POST', `${repo}/actions/runs/${run.id}/rerun-failed-jobs`);
        if (r.status !== 201) return refused(r.status, r.json.message);
    }
    return { ok: `Running ${failed.length === 1 ? 'it' : `${failed.length} runs`} again`, href: `https://github.com/${OWNER}/${repo}/actions` };
}

/** Runs a repo's deploy workflow on main, as its Run workflow button does. */
export async function runWorkflow(token: string, repo: string, workflow: string): Promise<ActResult> {
    const r = await github(token, 'POST', `${repo}/actions/workflows/${workflow}/dispatches`, { ref: 'main' });
    return r.status === 204 ? { ok: 'Deploy started', href: `https://github.com/${OWNER}/${repo}/actions/workflows/${workflow}` } : refused(r.status, r.json.message);
}

/**
 * Merges Dependabot PRs one after another, each pinned to the commit the page showed. One GitHub refuses (a lockfile
 * conflict after the one before, a new push, checks still going) is left as it is, and the rest still go.
 */
export async function mergeAll(token: string, repo: string, prs: { number: number; sha: string }[]): Promise<ActResult> {
    const merged: number[] = [], left: number[] = [];
    for (const pr of prs) ((await merge(token, repo, pr.number, pr.sha)).ok ? merged : left).push(pr.number);
    const list = (ns: number[]) => ns.map(n => `#${n}`).join(', ');
    if (!merged.length) return { error: `GitHub merged none of ${list(left)}. Open them to see why.` };
    return { ok: `Merged ${list(merged)}${left.length ? `. ${list(left)} not merged, open ${left.length === 1 ? 'it' : 'them'} to see why` : ''}` };
}
