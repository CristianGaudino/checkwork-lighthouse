import { OWNER, PROJECTS } from '../../lighthouse.config';

/**
 * The few things Lighthouse can change on GitHub: approve a PR, merge it, open an issue. They use GITHUB_WRITE_TOKEN,
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
export function checkIssue(form: { title: unknown; body: unknown; type: unknown }) {
    const title = typeof form.title === 'string' ? form.title.trim() : '';
    const body = typeof form.body === 'string' ? form.body.trim() : '';
    if (!title || title.length > 256) return null;
    if (body.length > 20_000) return null;
    const type = (ISSUE_TYPES as readonly string[]).includes(form.type as string) ? (form.type as string) : 'Task';
    return { title, body, type };
}

async function github(token: string, method: string, path: string, body: object) {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'lighthouse', 'x-github-api-version': '2022-11-28' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; html_url?: string; number?: number };
    return { status: res.status, json };
}

// GitHub explains a refusal in `message`; show it, since it says what to do (checks pending, not mergeable, no permission)
const refused = (status: number, message?: string) => ({ error: `GitHub refused (${status}): ${message ?? 'no reason given'}` });

export async function approve(token: string, repo: string, number: number): Promise<ActResult> {
    const r = await github(token, 'POST', `${repo}/pulls/${number}/reviews`, { event: 'APPROVE' });
    return r.status === 200 ? { ok: `Approved #${number}` } : refused(r.status, r.json.message);
}

export async function merge(token: string, repo: string, number: number): Promise<ActResult> {
    // A merge commit, as every PR in these repos has been merged so far
    const r = await github(token, 'PUT', `${repo}/pulls/${number}/merge`, { merge_method: 'merge' });
    return r.status === 200 ? { ok: `Merged #${number}` } : refused(r.status, r.json.message);
}

export async function createIssue(token: string, repo: string, issue: { title: string; body: string; type: string }): Promise<ActResult> {
    const r = await github(token, 'POST', `${repo}/issues`, issue);
    return r.status === 201 ? { ok: `Opened #${r.json.number} in ${repo}`, href: r.json.html_url } : refused(r.status, r.json.message);
}
