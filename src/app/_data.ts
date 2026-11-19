import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { canSnooze, readSnoozed, SNOOZE_COOKIE } from '@/lib/snooze';
import { fetchRepos, fetchRuns, type PullRequest, type RepoStatus } from '@/lib/github';
import { fetchMonitors, matchUptime, type Uptime } from '@/lib/uptime';
import { fetchUsage, minutesTask, summarise, type Minutes } from '@/lib/minutes';
import { fetchAnalytics, fetchVisitors, workerTasks, type Analytics as AnalyticsData, type Visitors } from '@/lib/cloudflare';
import { clerkSecretName, fetchUsers, type Users } from '@/lib/clerk';
import { fetchNeon, type NeonUsage } from '@/lib/neon';
import { fetchDeployed, fetchLive, liveState, type LiveState } from '@/lib/live';
import { ago, buildBoard, lightOf, mainTask, taskKey, type Task } from '@/lib/today';
import { memo, MINUTE } from '@/lib/memo';
import { alertTask, fetchAlerts, type Alerts } from '@/lib/security';
import { domainOf, domainTasks, fetchExpiry, ownDomain } from '@/lib/domains';
import { fetchIcon, iconsByRepo } from '@/lib/icons';
import { buildActivity, fetchFailedRuns, fetchHistory, type Event } from '@/lib/activity';
import { failureText, fetchFailure } from '@/lib/failure';
import { fetchBindings, missingOnWorker } from '@/lib/secrets';
import { fetchWorkerErrors, type WorkerError } from '@/lib/werrors';
import { fetchClaudeCost, fetchCloudflarePlans, type Plan } from '@/lib/costs';
import { fetchOwned, mergeProjects, type Listed, type Owned } from '@/lib/repos';
import { BOARDS } from '@/lib/board';
import { OWNER, PROJECTS } from '../../lighthouse.config';

/** Each source loads on its own and fails on its own: a problem comes back as a sentence for the page, never a throw. */

/**
 * Every repo OWNER has, config lines first, each with its status (src/lib/repos.ts). Without GitHub, the config lines
 * alone, all active. cache(): every loader below asks in the same request.
 */
export const loadProjects = cache(async function loadProjects(): Promise<Listed[]> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return mergeProjects(PROJECTS, []);
    try {
        lastOwned = await memo('owned', 10 * MINUTE, () => fetchOwned(token));
    } catch (error) {
        console.error('Could not list the repos', error);
    }
    return mergeProjects(PROJECTS, lastOwned);
});
// The last list GitHub gave this Worker instance: a failed listing falls back to it, so a muted repo doesn't wake up for a minute
let lastOwned: Owned[] = [];

/** The repos not archived: what every list, count and fetch below covers, in this order. */
export const loadWatched = async () => (await loadProjects()).filter(p => p.status !== 'archived');
/** The project boards of repos not archived. */
export const loadBoards = async () => { const watched = new Set((await loadWatched()).map(p => p.repo)); return BOARDS.filter(b => watched.has(b.repo)); };
// Answers that line up with the list by position are remembered per list, so a list that changed never mismatches them
const listKey = (ps: Listed[]) => ps.map(p => p.repo).join(',');

export async function loadRepos(): Promise<{ repos: RepoStatus[]; problem?: string }> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { repos: [], problem: 'No GitHub data: set GITHUB_TOKEN on the Worker (or in .env.local) to see PRs and releases.' };
    try {
        const watched = await loadWatched();
        return { repos: await memo(`repos ${listKey(watched)}`, MINUTE, () => fetchRepos(watched, token)) };
    } catch (error) {
        console.error('Could not load GitHub', error);
        return { repos: [], problem: 'GitHub did not answer, so PRs and releases are missing. Reload in a minute.' };
    }
}

export async function loadUptime(): Promise<{ uptimes?: (Uptime | null)[]; problem?: string }> {
    const key = process.env.UPTIMEROBOT_API_KEY;
    if (!key) return { problem: 'No uptime data: set UPTIMEROBOT_API_KEY on the Worker (or in .env.local).' };
    try {
        return { uptimes: matchUptime(await loadWatched(), await memo('uptime', MINUTE, () => fetchMonitors(key))) };
    } catch (error) {
        console.error('Could not load UptimeRobot', error);
        // The free plan allows 10 requests a minute, so a burst of reloads can hit it
        return { problem: 'UptimeRobot did not answer, so uptime is missing. Reload in a minute.' };
    }
}

export async function loadMinutes(publicRepos: Promise<Set<string>>): Promise<{ minutes?: Minutes; problem?: string }> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return {}; // loadRepos already says the token is missing
    try {
        // Billing totals move by the minute at most, so ten minutes is plenty
        const [items, free] = await Promise.all([memo('billing', 10 * MINUTE, () => fetchUsage(token)), publicRepos]);
        return { minutes: summarise(items, free) };
    } catch (error) {
        console.error('Could not load Actions usage', error);
        return /: 40[13]$/.test(String(error instanceof Error ? error.message : error))
            ? { problem: 'No Actions minutes: GitHub refused the billing report. The token needs the Plan (read) account permission.' }
            : { problem: 'No Actions minutes: GitHub did not answer the billing report. Reload in a minute.' };
    }
}

export async function loadAnalytics(): Promise<{ data?: AnalyticsData; problem?: string; setup?: string }> {
    const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
    // A missing key is setup still to do, not a failure: the page shows it quietly
    if (!token || !account) return { setup: 'Set CLOUDFLARE_ANALYTICS_TOKEN (Account Analytics: Read) and CLOUDFLARE_ACCOUNT_ID to see visits, page views and Worker errors.' };
    try {
        return { data: await memo('analytics', 5 * MINUTE, () => fetchAnalytics(token, account)) };
    } catch (error) {
        console.error('Could not load Cloudflare analytics', error);
        return { problem: 'Cloudflare did not answer the analytics query. Check the token has Account Analytics: Read, then reload.' };
    }
}

/** Last week's visits and where this week's came from. loadAnalytics already asks for a missing token; a refusal is a warning. */
export async function loadVisitors(): Promise<{ visitors?: Map<string, Visitors>; problem?: string }> {
    const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !account) return {};
    try {
        return { visitors: await memo('visitors', 5 * MINUTE, () => fetchVisitors(token, account)) };
    } catch (error) {
        console.error('Could not load Cloudflare visitors', error);
        return { problem: 'Cloudflare did not answer the visitors query, so last week and referrers are missing. Reload in a minute.' };
    }
}

/**
 * Sign-ups and active users from the repo's Clerk app, when its secret is set. `clerk`: the repo's .env.example names
 * CLERK_SECRET_KEY, so a missing secret is setup still to do; for any other repo it says nothing.
 */
export async function loadUsers(repo: string, clerk: boolean): Promise<{ users?: Users; problem?: string; setup?: string }> {
    const name = clerkSecretName(repo), key = process.env[name];
    if (!key) return clerk ? { setup: `Set ${name} (the Clerk app's secret key) to see sign-ups and active users.` } : {};
    try {
        return { users: await memo(`users ${repo}`, 10 * MINUTE, () => fetchUsers(key)) };
    } catch (error) {
        logFailure('Could not load Clerk users', error);
        return { problem: refusedBy(error) ? `Clerk refused ${name}. It must be the app's secret key (sk_live_...).` : 'Clerk did not answer, so users are missing. Reload in a minute.' };
    }
}

export async function loadNeon(): Promise<{ projects?: NeonUsage[]; problem?: string; setup?: string }> {
    const key = process.env.NEON_API_KEY;
    if (!key) return { setup: 'Set NEON_API_KEY to see compute and storage for the Neon projects (vintage and how-much).' };
    try {
        return { projects: await memo('neon', 10 * MINUTE, () => fetchNeon(key)) };
    } catch (error) {
        console.error('Could not load Neon', error);
        return { problem: 'Neon did not answer. Check NEON_API_KEY, then reload.' };
    }
}

export async function loadLive(workers: string[]): Promise<{ deployed?: Map<string, string>; setup?: string; problem?: string }> {
    const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !account) return {}; // loadAnalytics already asks for these
    try {
        return { deployed: await memo('live', 2 * MINUTE, () => fetchLive(token, account, workers)) };
    } catch (error) {
        if (/: 40[13]$/.test(String(error instanceof Error ? error.message : error))) return { setup: 'Add Workers Scripts: Read to CLOUDFLARE_ANALYTICS_TOKEN to see which sites run the latest main.' };
        console.error('Could not load Worker deployments', error);
        return { problem: 'Cloudflare did not say when the Workers were deployed. Reload in a minute.' };
    }
}

/** When the sites without a Worker (Vercel) were last deployed, from GitHub. Quiet on failure: they show a dash. */
async function loadDeployed(repos: RepoStatus[]): Promise<Map<string, string>> {
    const token = process.env.GITHUB_TOKEN;
    const names = (await loadWatched()).filter((_, i) => repos[i] && !repos[i]!.worker).map(p => p.repo);
    if (!token || !names.length) return new Map();
    try {
        return await memo('deployed', MINUTE, () => fetchDeployed(token, names));
    } catch (error) {
        console.error('Could not load GitHub deployments', error);
        return new Map();
    }
}

/**
 * Checks from Actions for main and the open PRs where GraphQL gave none (private repos), by commit. Each commit is asked
 * once a minute at most; one GitHub refuses stays 'none', and its PR then gets no Merge button (see prTask).
 */
async function loadRuns(repos: RepoStatus[]): Promise<Map<string, PullRequest['checks']>> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return new Map();
    const ask = (await loadWatched()).flatMap((p, i) => {
        const r = repos[i];
        return r ? [r.main, ...r.prs.filter(pr => !pr.draft)].flatMap(c => (c.checks === 'none' && c.sha ? [{ repo: p.repo, sha: c.sha }] : [])) : [];
    });
    const found = await Promise.all(ask.map(({ repo, sha }) => memo(`runs ${sha}`, MINUTE, () => fetchRuns(token, repo, sha)).then(
        checks => [sha, checks] as const,
        error => { console.error('Could not load Actions runs', error); return null; },
    )));
    return new Map(found.filter(f => f !== null));
}

/** Dependabot alerts per project; a setup note while the token can't read any. */
async function loadAlerts(): Promise<{ alerts?: (Alerts | null)[]; setup?: string }> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return {};
    try {
        const watched = await loadWatched();
        const alerts = await memo(`alerts ${listKey(watched)}`, 10 * MINUTE, () => fetchAlerts(token, watched));
        return alerts.some(a => a) ? { alerts } : { setup: 'Add Dependabot alerts: Read to GITHUB_TOKEN to see security alerts.' };
    } catch (error) {
        console.error('Could not load Dependabot alerts', error);
        return {};
    }
}

/** When each site's domain expires. Quiet on failure: domains move slowly, and the next load tries again. */
async function loadDomains(): Promise<Map<string, string>> {
    try {
        // Expiry dates change once a year, so half a day is plenty
        const sites = (await loadWatched()).flatMap(p => (p.site && ownDomain(p.site) ? p.site : []));
        return await memo(`domains ${sites.join()}`, 720 * MINUTE, () => fetchExpiry([...new Set(sites.map(domainOf))]));
    } catch (error) {
        console.error('Could not load domain expiry', error);
        return new Map();
    }
}

/** The last week across every project, for Activity and the Overview. Failed runs that can't be read are left out quietly. */
export async function loadActivity(): Promise<{ events?: Event[]; problem?: string }> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return {}; // loadRepos already says the token is missing
    try {
        const watched = await loadWatched();
        const [t, history, failed] = await Promise.all([
            loadToday(),
            memo(`history ${listKey(watched)}`, 2 * MINUTE, () => fetchHistory(token, watched)),
            Promise.all(watched.map(p => memo(`failed ${p.repo}`, 2 * MINUTE, () => fetchFailedRuns(token, p.repo)).catch(error => { console.error('Could not load failed runs', error); return null; }))),
        ]);
        return { events: buildActivity(t.sites, history, failed) };
    } catch (error) {
        console.error('Could not load activity', error);
        return { problem: 'GitHub did not answer, so recent activity is missing. Reload in a minute.' };
    }
}

const refusedBy = (error: unknown) => /: 40[13]$/.test(String(error instanceof Error ? error.message : error));
// A refusal is setup still to do, which the page already says quietly: a warning, so dev's error badge stays for real failures
const logFailure = (what: string, error: unknown) => (refusedBy(error) ? console.warn : console.error)(what, error);

/**
 * Why each failing commit failed (#56), onto its task and its Fix with Claude prompt. Only for full task lists (Work, a
 * project), never in loadToday, so no other page waits on it. A minute, like the checks: a re-run that fails again shows
 * its own step. Quiet on failure: the task still links to Actions.
 */
export async function withFailures(tasks: Task[]): Promise<Task[]> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return tasks;
    return Promise.all(tasks.map(async t => {
        if (!t.rerun) return t;
        const { repo, sha } = t.rerun;
        const failure = await memo(`failure ${sha}`, MINUTE, () => fetchFailure(token, repo, sha)).catch(error => { logFailure('Could not load why checks failed', error); return null; });
        return failure ? { ...t, failure, fix: t.fix && `${t.fix}

${failureText(failure)}` } : t;
    }));
}

/** Claude API spend and Cloudflare's plans, for Costs. A missing key is a quiet note; a refusal says which permission. */
export async function loadCosts(): Promise<{ claude?: number; claudeNote?: string; plans?: Plan[]; plansNote?: string }> {
    const admin = process.env.ANTHROPIC_ADMIN_KEY, token = process.env.CLOUDFLARE_ANALYTICS_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
    const [claude, cloudflare] = await Promise.all([
        admin
            ? memo('claude cost', 30 * MINUTE, () => fetchClaudeCost(admin)).then(claude => ({ claude }), error => {
                logFailure('Could not load Claude API cost', error);
                return { claudeNote: refusedBy(error) ? 'Anthropic refused ANTHROPIC_ADMIN_KEY. It must be an Admin API key.' : 'Anthropic did not answer. Reload in a minute.' };
            })
            : { claudeNote: 'Set ANTHROPIC_ADMIN_KEY (an Admin API key from the Claude Console) to see it.' },
        token && account
            ? memo('cloudflare plans', 60 * MINUTE, () => fetchCloudflarePlans(token, account)).then(plans => ({ plans }), error => {
                logFailure('Could not load Cloudflare subscriptions', error);
                return { plansNote: refusedBy(error) ? 'Add Billing: Read to CLOUDFLARE_ANALYTICS_TOKEN to see it.' : 'Cloudflare did not answer. Reload in a minute.' };
            })
            : { plansNote: 'Set CLOUDFLARE_ANALYTICS_TOKEN and CLOUDFLARE_ACCOUNT_ID to see it.' },
    ]);
    return { ...claude, ...cloudflare };
}

/**
 * One Worker's top errors over 24 hours (#58), for its project page. The query API takes only the Workers Observability
 * permission, so a refusal is a quiet setup note.
 */
export async function loadWorkerErrors(worker: string, deployedAt: string | undefined): Promise<{ errors?: WorkerError[]; setup?: string; problem?: string }> {
    const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !account) return {}; // loadAnalytics already asks for these
    try {
        return { errors: await memo(`worker errors ${worker} ${deployedAt}`, 5 * MINUTE, () => fetchWorkerErrors(token, account, worker, deployedAt)) };
    } catch (error) {
        logFailure('Could not load Worker errors', error);
        return refusedBy(error)
            ? { setup: 'Add Workers Observability to CLOUDFLARE_ANALYTICS_TOKEN to see the top error messages.' }
            : { problem: 'Cloudflare did not answer the Workers Logs query. Reload in a minute.' };
    }
}

/** Names in .env.example the Worker has no setting for (#34); undefined when that can't be told. */
export async function loadMissingSettings(worker: string | null, names: string[] | undefined): Promise<string[] | undefined> {
    const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !account || !worker || !names?.length) return undefined;
    try {
        const bindings = await memo(`bindings ${worker}`, 10 * MINUTE, () => fetchBindings(token, account, worker));
        return bindings ? missingOnWorker(names, bindings) : undefined;
    } catch (error) {
        logFailure('Could not load Worker settings', error); // a refusal is the Running column's setup note already
        return undefined;
    }
}

/** Each project's favicon by repo, for the layout's icon classes. Never fails: a site that doesn't answer gets its letter tile. */
export const loadIcons = async () => {
    const sited = (await loadWatched()).filter(p => p.site);
    // Favicons change rarely; the page's Refresh forgets them along with everything else
    return memo(`icons ${listKey(sited)}`, 720 * MINUTE, async () => iconsByRepo(sited, await Promise.all(sited.map(p => fetchIcon(p.site!)))));
};

/**
 * Everything behind the task queue, shared by the page, the layout and the morning brief so all see the same picture.
 * cache(): the layout and the page ask in the same request, and share one load.
 */
export const loadToday = cache(async function loadToday() {
    const all = await loadProjects();
    const watched = all.filter(p => p.status !== 'archived');
    const reposLoad = loadRepos();
    // The billing report is fetched alongside; it only needs the repos' visibility to count the private ones
    const publicRepos = reposLoad.then(({ repos }) => new Set(watched.filter((_, i) => repos[i]?.isPrivate === false).map(p => p.repo)));
    const liveLoad = reposLoad.then(({ repos }) => Promise.all([loadLive([...new Set(repos.flatMap(r => r?.worker ?? []))]), loadDeployed(repos), loadRuns(repos)]));
    const [{ repos: answered, problem }, uptime, usage, analytics, [deploys, deployed, runs], security, domains] = await Promise.all([reposLoad, loadUptime(), loadMinutes(publicRepos), loadAnalytics(), liveLoad, loadAlerts(), loadDomains()]);
    // Checks from Actions where GraphQL couldn't say
    const withRuns = <C extends { sha: string | null; checks: PullRequest['checks'] }>(c: C): C => (c.sha && runs.has(c.sha) ? { ...c, checks: runs.get(c.sha)! } : c);
    const repos = answered.map(r => r && { ...r, main: withRuns(r.main), prs: r.prs.map(withRuns) });
    const board = buildBoard(watched, problem ? undefined : repos, uptime.uptimes);
    const rows = watched.map((p, i) => ({ ...p, worker: repos[i]?.worker ?? null }));
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    // A Worker site asks Cloudflare when it was deployed; any other site (Vercel) goes by GitHub's record of its deploys
    const live: (LiveState | null)[] = watched.map((_, i) => {
        const r = repos[i];
        return liveState(r, r?.worker ? deploys.deployed?.get(r.worker) : deployed.get(watched[i].repo));
    });
    const extra: Task[] = [
        ...watched.flatMap((p, i) => mainTask(p, repos[i], live[i]) ?? []),
        ...watched.flatMap((p, i) => alertTask(p, security.alerts?.[i]) ?? []),
        ...domainTasks(watched, domains),
        ...watched.flatMap((p, i) => {
            const l = live[i];
            if (l?.state !== 'behind') return [];
            // Only a Worker can be deployed from this PC (docs/deploy-from-pc.md); a Vercel site's deploy failed or was skipped
            return [rows[i].worker
                ? {
                    project: p.name, level: 2 as const, action: 'Deploy', title: l.label, detail: `Live since ${ago(l.since)}`, href: `https://github.com/${OWNER}/${p.repo}/actions`, deploy: p.repo,
                    dispatch: repos[i]?.deployWorkflow ? { repo: p.repo, workflow: repos[i]!.deployWorkflow! } : undefined,
                }
                : { project: p.name, level: 2 as const, action: 'Check the deploy', title: l.label, detail: `Live since ${ago(l.since)}`, href: `https://github.com/${OWNER}/${p.repo}/deployments` }];
        }),
        ...(usage.minutes ? [minutesTask(usage.minutes)].filter(t => t !== null) : []),
        ...(analytics.data && account ? workerTasks(rows, analytics.data, account) : []),
    ];
    // Stable sort: these slot in by level, after the project tasks of the same level
    const tasks = [...board.tasks, ...extra].sort((a, b) => a.level - b.level);
    // One row per site, in list order, for the Sites list and each project's page; its light counts every task it has
    const sites = board.projects.map((p, i) => ({
        p, live: live[i], worker: rows[i].worker, light: lightOf(tasks.filter(t => t.project === p.name)),
        alerts: security.alerts?.[i], expires: p.site ? domains.get(domainOf(p.site)) ?? null : null, status: watched[i].status,
    }));
    // Snoozed in this browser: out of every list and count, though a site's light still says how it is
    const asleep = readSnoozed((await cookies()).get(SNOOZE_COOKIE)?.value);
    const shown = tasks.filter(t => !(canSnooze(t.level) && Object.hasOwn(asleep, taskKey(t))));
    // Idle and muted projects' tasks are listed apart and left out of every count; muted ones never notify either (layout)
    const statusBy = new Map(watched.map(p => [p.name, p.status]));
    const only = (status: Listed['status']) => shown.filter(t => (statusBy.get(t.project) ?? 'active') === status);
    return {
        repos, problem, uptime, usage, analytics, deploys, security, rows, sites,
        tasks: only('active'), idle: only('idle'), muted: only('muted'), snoozed: tasks.length - shown.length, archived: all.filter(p => p.status === 'archived'),
    };
});
