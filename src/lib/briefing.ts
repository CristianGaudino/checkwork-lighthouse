import { z } from 'zod';
import { githubGraphql } from './github';
import { OWNER } from '../../lighthouse.config';
import type { Task } from './today';
import type { Board } from './board';

/** Facts for the morning brief and the incident helper, and the prompts built from them. The prompts hold facts only. */

export type Merged = { repo: string; title: string; author: string; mergedAt: string };
export type Commit = { message: string; date: string; author: string };
export type Run = { name: string; conclusion: string | null; status: string; createdAt: string; sha: string };


const MergedData = z.object({ search: z.object({ nodes: z.array(z.object({
    title: z.string(), mergedAt: z.string(), author: z.object({ login: z.string() }).nullable(), repository: z.object({ name: z.string() }),
}).partial()) }) });

/** PRs merged across the owner's repos since `since` (the last day, for the brief). */
export async function fetchMerged(token: string, since: Date): Promise<Merged[]> {
    const q = `user:${OWNER} is:pr is:merged merged:>=${since.toISOString().slice(0, 10)}`;
    const data = MergedData.parse(await githubGraphql(token, `{ search(query: ${JSON.stringify(q)}, type: ISSUE, first: 50) { nodes { ... on PullRequest { title mergedAt author { login } repository { name } } } } }`));
    return data.search.nodes.flatMap(n => n.title && n.mergedAt && n.repository ? [{ repo: n.repository.name, title: n.title, author: n.author?.login ?? 'ghost', mergedAt: n.mergedAt }] : []);
}

const History = z.object({ repository: z.object({ ref: z.object({ target: z.object({ history: z.object({ nodes: z.array(z.object({
    messageHeadline: z.string(), committedDate: z.string(), author: z.object({ name: z.string().nullable() }).nullable(),
})) }) }) }).nullable() }).nullable() });
const Runs = z.object({ workflow_runs: z.array(z.object({ name: z.string().nullable(), conclusion: z.string().nullable(), status: z.string().nullable(), created_at: z.string(), head_sha: z.string() })) });

/** Main's latest commits from the history query; [] when the repo or branch is missing. */
export function parseHistory(raw: unknown): Commit[] {
    // Tolerant: a refused or odd history gives [] and leaves the runs, fetched alongside, intact
    return (History.safeParse(raw).data?.repository?.ref?.target.history.nodes ?? []).map(c => ({ message: c.messageHeadline, date: c.committedDate, author: c.author?.name ?? '?' }));
}

/** The last commits on main and the last workflow runs of one repo: what changed and what deployed before a site went down. */
export async function fetchIncidentFacts(token: string, repo: string): Promise<{ commits: Commit[]; runs: Run[] }> {
    const [history, runs] = await Promise.all([
        githubGraphql(token, `{ repository(owner: ${JSON.stringify(OWNER)}, name: ${JSON.stringify(repo)}) { ref(qualifiedName: "main") { target { ... on Commit { history(first: 10) { nodes { messageHeadline committedDate author { name } } } } } } } }`),
        fetch(`https://api.github.com/repos/${OWNER}/${encodeURIComponent(repo)}/actions/runs?per_page=6`, {
            headers: { authorization: `Bearer ${token}`, 'user-agent': 'lighthouse', 'x-github-api-version': '2022-11-28' }, signal: AbortSignal.timeout(10_000),
        }).then(r => (r.ok ? r.json() : { workflow_runs: [] })),
    ]);
    return {
        commits: parseHistory(history),
        runs: Runs.parse(runs).workflow_runs.map(r => ({ name: r.name ?? '?', conclusion: r.conclusion, status: r.status ?? '?', createdAt: r.created_at, sha: r.head_sha.slice(0, 7) })),
    };
}

const list = (lines: string[], empty: string) => (lines.length ? lines.map(l => `- ${l}`).join('\n') : `- ${empty}`);

export function briefPrompt(f: { now: Date; tasks: Task[]; board?: Board; merged: Merged[]; minutes?: { used: number; projected: number; byRepo: { repo: string; minutes: number; free: boolean }[] } }): string {
    const mine = f.merged.filter(m => m.author === OWNER), others = f.merged.filter(m => m.author !== OWNER);
    return `Write my morning brief for ${f.now.toISOString().slice(0, 10)}: what needs me first, what moved in the last day, and what my other dev shipped. Keep it under 25 lines.

Needs attention now (from my dashboard, worst first):
${list(f.tasks.map(t => `${t.project}: ${t.action} ${t.title ?? ''} (${t.detail})`), 'nothing')}

Merged in the last day by me (or Claude working as me):
${list(mine.map(m => `${m.repo}: ${m.title}`), 'nothing')}

Merged in the last day by others:
${list(others.map(m => `${m.repo}: ${m.title} (by ${m.author})`), 'nothing')}

Board, in progress:
${list(f.board?.columns['In Progress'].map(c => `${c.project}: ${c.title}`) ?? [], 'unknown')}

Board, in review:
${list(f.board?.columns['In Review'].map(c => `${c.project}: ${c.title}`) ?? [], 'unknown')}

GitHub Actions minutes: ${f.minutes ? `${f.minutes.used} of 2,000 used by private repos, on pace for ${f.minutes.projected} this month. Public repos are free and don't count. Private repos' share: ${f.minutes.byRepo.filter(r => !r.free).map(r => `${r.repo} ${r.minutes}`).join(', ') || 'none'}` : 'unknown'}`;
}

export function incidentPrompt(f: { project: string; site: string; down: string; commits: Commit[]; runs: Run[]; workerErrors?: string }): string {
    return `${f.site} (${f.project}) is down per UptimeRobot: ${f.down}. Give me the most likely causes in order, each with the first thing to check, then one line on whether to roll back. Keep it under 15 lines.

Last commits on main, newest first:
${list(f.commits.map(c => `${c.date} ${c.author}: ${c.message}`), 'none found')}

Last workflow runs, newest first:
${list(f.runs.map(r => `${r.createdAt} ${r.name}: ${r.conclusion ?? r.status} at ${r.sha}`), 'none found')}

Worker errors in the last 24 hours: ${f.workerErrors ?? 'unknown (no Cloudflare analytics)'}`;
}
