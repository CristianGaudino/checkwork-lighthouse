import 'server-only';
import { fetchRepos, type RepoStatus } from '@/lib/github';
import { fetchMonitors, matchUptime, type Uptime } from '@/lib/uptime';
import { fetchUsage, minutesTask, summarise, type Minutes } from '@/lib/minutes';
import { fetchAnalytics, workerTasks, type Analytics as AnalyticsData } from '@/lib/cloudflare';
import { fetchNeon, type NeonUsage } from '@/lib/neon';
import { buildBoard, type Task } from '@/lib/today';
import { PROJECTS } from '../../lighthouse.config';

/** Each source loads on its own and fails on its own: a problem comes back as a sentence for the page, never a throw. */

export async function loadRepos(): Promise<{ repos: RepoStatus[]; problem?: string }> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { repos: [], problem: 'No GitHub data: set GITHUB_TOKEN on the Worker (or in .env.local) to see PRs and releases.' };
    try {
        return { repos: await fetchRepos(PROJECTS, token) };
    } catch (error) {
        console.error('Could not load GitHub', error);
        return { repos: [], problem: 'GitHub did not answer, so PRs and releases are missing. Reload in a minute.' };
    }
}

export async function loadUptime(): Promise<{ uptimes?: (Uptime | null)[]; problem?: string }> {
    const key = process.env.UPTIMEROBOT_API_KEY;
    if (!key) return { problem: 'No uptime data: set UPTIMEROBOT_API_KEY on the Worker (or in .env.local).' };
    try {
        return { uptimes: matchUptime(PROJECTS, await fetchMonitors(key)) };
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
        const [items, free] = await Promise.all([fetchUsage(token), publicRepos]);
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
        return { data: await fetchAnalytics(token, account) };
    } catch (error) {
        console.error('Could not load Cloudflare analytics', error);
        return { problem: 'Cloudflare did not answer the analytics query. Check the token has Account Analytics: Read, then reload.' };
    }
}

export async function loadNeon(): Promise<{ projects?: NeonUsage[]; problem?: string; setup?: string }> {
    const key = process.env.NEON_API_KEY;
    if (!key) return { setup: 'Set NEON_API_KEY to see compute and storage for the Neon projects (vintage and how-much).' };
    try {
        return { projects: await fetchNeon(key) };
    } catch (error) {
        console.error('Could not load Neon', error);
        return { problem: 'Neon did not answer. Check NEON_API_KEY, then reload.' };
    }
}


/** Everything behind the task queue, shared by the page and the morning brief so both see the same picture. */
export async function loadToday() {
    const reposLoad = loadRepos();
    // The billing report is fetched alongside; it only needs the repos' visibility to count the private ones
    const publicRepos = reposLoad.then(({ repos }) => new Set(PROJECTS.filter((_, i) => repos[i]?.isPrivate === false).map(p => p.repo)));
    const [{ repos, problem }, uptime, usage, analytics] = await Promise.all([reposLoad, loadUptime(), loadMinutes(publicRepos), loadAnalytics()]);
    const board = buildBoard(PROJECTS, problem ? undefined : repos, uptime.uptimes);
    const rows = PROJECTS.map((p, i) => ({ ...p, worker: repos[i]?.worker ?? null }));
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    const extra: Task[] = [
        ...(usage.minutes ? [minutesTask(usage.minutes)].filter(t => t !== null) : []),
        ...(analytics.data && account ? workerTasks(rows, analytics.data, account) : []),
    ];
    // Stable sort: these slot in by level, after the project tasks of the same level
    const tasks = [...board.tasks, ...extra].sort((a, b) => a.level - b.level);
    return { repos, problem, uptime, usage, analytics, tasks, projects: board.projects, rows };
}
