'use server';

import { requireAdmin } from '@/lib/access';
import { askClaude, type AskResult } from '@/lib/ask';
import { fetchBoardItems, fetchIssueLinks, groupBoard } from '@/lib/board';
import { briefPrompt, fetchIncidentFacts, fetchMerged, incidentPrompt } from '@/lib/briefing';
import { span } from '@/lib/today';
import { forgetAll, memo, MINUTE } from '@/lib/memo';
import { revalidatePath } from 'next/cache';
import { PROJECTS } from '../../lighthouse.config';
import { loadAnalytics, loadRepos, loadToday, loadUptime } from './_data';

/**
 * The two Claude buttons, and the page's Refresh. Server actions are reachable by a direct POST, so each one checks the Access login again
 * (the page's check does not cover them) and treats the form input as untrusted.
 */

const keys = () => ({ claude: process.env.ANTHROPIC_API_KEY, github: process.env.GITHUB_TOKEN, projects: process.env.GITHUB_PROJECTS_TOKEN });

export async function morningBrief(): Promise<AskResult> {
    await requireAdmin();
    const k = keys();
    if (!k.claude) return { error: 'Set ANTHROPIC_API_KEY to use the brief.' };
    const now = new Date();
    const [today, merged, board] = await Promise.all([
        loadToday(),
        k.github ? fetchMerged(k.github, new Date(now.getTime() - 86_400_000)).catch(() => []) : [],
        k.projects
            ? Promise.all([memo('board', MINUTE, () => fetchBoardItems(PROJECTS, k.projects!)), k.github ? memo('issue-links', MINUTE, () => fetchIssueLinks(PROJECTS, k.github!)) : new Map<string, string>()])
                .then(([items, links]) => groupBoard(PROJECTS, items, links)).catch(() => undefined)
            : undefined,
    ]);
    return askClaude(briefPrompt({ now, tasks: today.tasks, board, merged, minutes: today.usage.minutes }), k.claude);
}

export async function incidentHelp(_prev: AskResult, form: FormData): Promise<AskResult> {
    await requireAdmin();
    const k = keys();
    if (!k.claude || !k.github) return { error: 'Set ANTHROPIC_API_KEY and GITHUB_TOKEN to use the incident helper.' };
    // Only a configured repo, never a name from the form used as is
    const i = PROJECTS.findIndex(p => p.repo === form.get('repo'));
    if (i < 0) return { error: 'Unknown project.' };
    const project = PROJECTS[i];
    const [{ repos }, uptime, analytics, facts] = await Promise.all([loadRepos(), loadUptime(), loadAnalytics(), fetchIncidentFacts(k.github, project.repo).catch(() => ({ commits: [], runs: [] }))]);
    const u = uptime.uptimes?.[i];
    const worker = repos[i]?.worker, w = worker ? analytics.data?.workers.get(worker) : undefined;
    return askClaude(incidentPrompt({
        project: project.name,
        site: project.site,
        down: u?.state === 'down' ? (u.seconds === null ? 'down now' : `down for ${span(u.seconds)}`) : `monitor says ${u?.state ?? 'unknown'}`,
        ...facts,
        workerErrors: w ? `${w.errors} of ${w.requests} requests` : undefined,
    }), k.claude);
}

/** The Refresh button: forget every remembered answer, then load whichever page it was pressed on fresh. */
export async function refresh() {
    await requireAdmin();
    forgetAll();
    revalidatePath('/', 'layout');
}
