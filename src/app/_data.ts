import 'server-only';
import { cache } from 'react';
import { fetchRepos, fetchRuns, type PullRequest, type RepoStatus } from '@/lib/github';
import { fetchMonitors, matchUptime, type Uptime } from '@/lib/uptime';
import { fetchUsage, minutesTask, summarise, type Minutes } from '@/lib/minutes';
import { fetchAnalytics, workerTasks, type Analytics as AnalyticsData } from '@/lib/cloudflare';
import { fetchNeon, type NeonUsage } from '@/lib/neon';
import { fetchDeployed, fetchLive, liveState, type LiveState } from '@/lib/live';
import { ago, buildBoard, lightOf, mainTask, type Task } from '@/lib/today';
import { memo, MINUTE } from '@/lib/memo';
import { alertTask, fetchAlerts, type Alerts } from '@/lib/security';
import { domainOf, domainTasks, fetchExpiry } from '@/lib/domains';
import { fetchIcon, iconsByRepo } from '@/lib/icons';
import { buildActivity, fetchFailedRuns, fetchHistory, type Event } from '@/lib/activity';
import { fetchClaudeCost, fetchCloudflarePlans, type Plan } from '@/lib/costs';
import { OWNER, PROJECTS } from '../../lighthouse.config';

/** Each source loads on its own and fails on its own: a problem comes back as a sentence for the page, never a throw. */

export async function loadRepos(): Promise<{ repos: RepoStatus[]; problem?: string }> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { repos: [], problem: 'No GitHub data: set GITHUB_TOKEN on the Worker (or in .env.local) to see PRs and releases.' };
    try {
        return { repos: await memo('repos', MINUTE, () => fetchRepos(PROJECTS, token)) };
    } catch (error) {
        console.error('Could not load GitHub', error);
        return { repos: [], problem: 'GitHub did not answer, so PRs and releases are missing. Reload in a minute.' };
    }
}

export async function loadUptime(): Promise<{ uptimes?: (Uptime | null)[]; problem?: string }> {
    const key = process.env.UPTIMEROBOT_API_KEY;
    if (!key) return { problem: 'No uptime data: set UPTIMEROBOT_API_KEY on the Worker (or in .env.local).' };
    try {
        return { uptimes: matchUptime(PROJECTS, await memo('uptime', MINUTE, () => fetchMonitors(key))) };
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
    const names = PROJECTS.filter((_, i) => repos[i] && !repos[i]!.worker).map(p => p.repo);
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
    const ask = PROJECTS.flatMap((p, i) => {
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
        const alerts = await memo('alerts', 10 * MINUTE, () => fetchAlerts(token, PROJECTS));
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
        return await memo('domains', 720 * MINUTE, () => fetchExpiry([...new Set(PROJECTS.map(p => domainOf(p.site)))]));
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
        const [t, history, failed] = await Promise.all([
            loadToday(),
            memo('history', 2 * MINUTE, () => fetchHistory(token, PROJECTS)),
            Promise.all(PROJECTS.map(p => memo(`failed ${p.repo}`, 2 * MINUTE, () => fetchFailedRuns(token, p.repo)).catch(error => { console.error('Could not load failed runs', error); return null; }))),
        ]);
        return { events: buildActivity(t.sites, history, failed) };
    } catch (error) {
        console.error('Could not load activity', error);
        return { problem: 'GitHub did not answer, so recent activity is missing. Reload in a minute.' };
    }
}

const refusedBy = (error: unknown) => /: 40[13]$/.test(String(error instanceof Error ? error.message : error));

/** Claude API spend and Cloudflare's plans, for Costs. A missing key is a quiet note; a refusal says which permission. */
export async function loadCosts(): Promise<{ claude?: number; claudeNote?: string; plans?: Plan[]; plansNote?: string }> {
    const admin = process.env.ANTHROPIC_ADMIN_KEY, token = process.env.CLOUDFLARE_ANALYTICS_TOKEN, account = process.env.CLOUDFLARE_ACCOUNT_ID;
    const [claude, cloudflare] = await Promise.all([
        admin
            ? memo('claude cost', 30 * MINUTE, () => fetchClaudeCost(admin)).then(claude => ({ claude }), error => {
                console.error('Could not load Claude API cost', error);
                return { claudeNote: refusedBy(error) ? 'Anthropic refused ANTHROPIC_ADMIN_KEY. It must be an Admin API key.' : 'Anthropic did not answer. Reload in a minute.' };
            })
            : { claudeNote: 'Set ANTHROPIC_ADMIN_KEY (an Admin API key from the Claude Console) to see it.' },
        token && account
            ? memo('cloudflare plans', 60 * MINUTE, () => fetchCloudflarePlans(token, account)).then(plans => ({ plans }), error => {
                console.error('Could not load Cloudflare subscriptions', error);
                return { plansNote: refusedBy(error) ? 'Add Billing: Read to CLOUDFLARE_ANALYTICS_TOKEN to see it.' : 'Cloudflare did not answer. Reload in a minute.' };
            })
            : { plansNote: 'Set CLOUDFLARE_ANALYTICS_TOKEN and CLOUDFLARE_ACCOUNT_ID to see it.' },
    ]);
    return { ...claude, ...cloudflare };
}

/** Each project's favicon by repo, for the layout's icon classes. Never fails: a site that doesn't answer gets its letter tile. */
export const loadIcons = () =>
    // Favicons change rarely; the page's Refresh forgets them along with everything else
    memo('icons', 720 * MINUTE, async () => iconsByRepo(PROJECTS, await Promise.all(PROJECTS.map(p => fetchIcon(p.site)))));

/**
 * Everything behind the task queue, shared by the page, the layout and the morning brief so all see the same picture.
 * cache(): the layout and the page ask in the same request, and share one load.
 */
export const loadToday = cache(async function loadToday() {
    const reposLoad = loadRepos();
    // The billing report is fetched alongside; it only needs the repos' visibility to count the private ones
    const publicRepos = reposLoad.then(({ repos }) => new Set(PROJECTS.filter((_, i) => repos[i]?.isPrivate === false).map(p => p.repo)));
    const liveLoad = reposLoad.then(({ repos }) => Promise.all([loadLive([...new Set(repos.flatMap(r => r?.worker ?? []))]), loadDeployed(repos), loadRuns(repos)]));
    const [{ repos: answered, problem }, uptime, usage, analytics, [deploys, deployed, runs], security, domains] = await Promise.all([reposLoad, loadUptime(), loadMinutes(publicRepos), loadAnalytics(), liveLoad, loadAlerts(), loadDomains()]);
    // Checks from Actions where GraphQL couldn't say
    const withRuns = <C extends { sha: string | null; checks: PullRequest['checks'] }>(c: C): C => (c.sha && runs.has(c.sha) ? { ...c, checks: runs.get(c.sha)! } : c);
    const repos = answered.map(r => r && { ...r, main: withRuns(r.main), prs: r.prs.map(withRuns) });
    const board = buildBoard(PROJECTS, problem ? undefined : repos, uptime.uptimes);
    const rows = PROJECTS.map((p, i) => ({ ...p, worker: repos[i]?.worker ?? null }));
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    // A Worker site asks Cloudflare when it was deployed; any other site (Vercel) goes by GitHub's record of its deploys
    const live: (LiveState | null)[] = PROJECTS.map((_, i) => {
        const r = repos[i];
        return liveState(r, r?.worker ? deploys.deployed?.get(r.worker) : deployed.get(PROJECTS[i].repo));
    });
    const extra: Task[] = [
        ...PROJECTS.flatMap((p, i) => mainTask(p, repos[i], live[i]) ?? []),
        ...PROJECTS.flatMap((p, i) => alertTask(p, security.alerts?.[i]) ?? []),
        ...domainTasks(PROJECTS, domains),
        ...PROJECTS.flatMap((p, i) => {
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
    // One row per site, in PROJECTS order, for the Sites list and each project's page; its light counts every task it has
    const sites = board.projects.map((p, i) => ({
        p, live: live[i], worker: rows[i].worker, light: lightOf(tasks.filter(t => t.project === p.name)),
        alerts: security.alerts?.[i], expires: domains.get(domainOf(p.site)) ?? null,
    }));
    return { repos, problem, uptime, usage, analytics, deploys, security, tasks, rows, sites };
});
