'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { requireAdmin } from '@/lib/access';
import { approve, checkBatch, checkBump, checkIssue, checkNumber, checkRepo, checkSha, checkWorkflow, createIssue, merge, mergeAll, rerunFailed, runWorkflow, type ActResult } from '@/lib/act';
import { forgetAll } from '@/lib/memo';
import { readSnoozed, snooze, SNOOZE_COOKIE, SNOOZE_DAYS } from '@/lib/snooze';

/**
 * The buttons that change something on GitHub: approve, merge, merge a Dependabot batch, new issue, re-run, run deploy,
 * cut a release. Snoozing changes only this browser's cookie. Reachable by a direct POST like any server action, so each one checks the
 * Access login again and checks every field from the form (src/lib/act.ts).
 */

const NO_TOKEN = { error: 'Set GITHUB_WRITE_TOKEN (Pull requests, Contents, Issues and Actions: Read and write) to act from here.' };

// After a change the remembered answers are stale, so every page loads fresh
const done = (r: ActResult) => { if (r.ok) { forgetAll(); revalidatePath('/', 'layout'); } return r; };

async function prFields(form: FormData) {
    await requireAdmin();
    const token = process.env.GITHUB_WRITE_TOKEN;
    const repo = checkRepo(form.get('repo')), number = checkNumber(form.get('number'));
    return { token, repo, number };
}

export async function approvePr(_prev: ActResult, form: FormData): Promise<ActResult> {
    const { token, repo, number } = await prFields(form);
    if (!token) return NO_TOKEN;
    if (!repo || !number) return { error: 'Unknown pull request.' };
    return done(await approve(token, repo, number));
}

export async function mergePr(_prev: ActResult, form: FormData): Promise<ActResult> {
    const { token, repo, number } = await prFields(form);
    const sha = checkSha(form.get('sha'));
    if (!token) return NO_TOKEN;
    if (!repo || !number || !sha) return { error: 'Unknown pull request.' };
    return done(await merge(token, repo, number, sha));
}

export async function newIssue(_prev: ActResult, form: FormData): Promise<ActResult> {
    await requireAdmin();
    const token = process.env.GITHUB_WRITE_TOKEN;
    if (!token) return NO_TOKEN;
    const repo = checkRepo(form.get('repo'));
    const issue = checkIssue({ title: form.get('title'), body: form.get('body'), type: form.get('type') });
    if (!repo) return { error: 'Pick a project.' };
    if (!issue) return { error: 'Give it a title (up to 256 characters).' };
    return done(await createIssue(token, repo, issue));
}

export async function mergeBatch(_prev: ActResult, form: FormData): Promise<ActResult> {
    await requireAdmin();
    const token = process.env.GITHUB_WRITE_TOKEN;
    if (!token) return NO_TOKEN;
    const repo = checkRepo(form.get('repo')), prs = checkBatch(form.get('prs'));
    if (!repo || !prs) return { error: 'Unknown pull requests.' };
    return done(await mergeAll(token, repo, prs));
}

export async function rerun(_prev: ActResult, form: FormData): Promise<ActResult> {
    await requireAdmin();
    const token = process.env.GITHUB_WRITE_TOKEN;
    if (!token) return NO_TOKEN;
    const repo = checkRepo(form.get('repo')), sha = checkSha(form.get('sha'));
    if (!repo || !sha) return { error: 'Unknown commit.' };
    return done(await rerunFailed(token, repo, sha));
}

export async function runDeploy(_prev: ActResult, form: FormData): Promise<ActResult> {
    await requireAdmin();
    const token = process.env.GITHUB_WRITE_TOKEN;
    if (!token) return NO_TOKEN;
    const repo = checkRepo(form.get('repo')), workflow = checkWorkflow(form.get('workflow'));
    if (!repo || !workflow) return { error: 'Unknown workflow.' };
    return done(await runWorkflow(token, repo, workflow));
}

/** Cuts a release: the repo's release.yml with the bump picked, which tags main and deploys that tag. */
export async function runRelease(_prev: ActResult, form: FormData): Promise<ActResult> {
    await requireAdmin();
    const token = process.env.GITHUB_WRITE_TOKEN;
    if (!token) return NO_TOKEN;
    const repo = checkRepo(form.get('repo')), bump = checkBump(form.get('bump'));
    if (!repo || !bump) return { error: 'Unknown release.' };
    return done(await runWorkflow(token, repo, 'release.yml', { bump }));
}

/** Hides a task for a day or a week, in this browser. Setting the cookie re-renders the page without it. */
export async function snoozeTask(form: FormData) {
    await requireAdmin();
    const key = form.get('key'), days = Number(form.get('days'));
    if (typeof key !== 'string' || !key || key.length > 300 || !(SNOOZE_DAYS as readonly number[]).includes(days)) return;
    const store = await cookies();
    const value = JSON.stringify(snooze(readSnoozed(store.get(SNOOZE_COOKIE)?.value), key, days));
    // Outlives the longest snooze by a day; httpOnly, since only the server reads it
    store.set(SNOOZE_COOKIE, value, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV !== 'development', maxAge: 8 * 86_400 });
}

/** Shows every snoozed task again. */
export async function wakeAll() {
    await requireAdmin();
    (await cookies()).delete(SNOOZE_COOKIE);
}
