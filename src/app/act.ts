'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/access';
import { approve, checkIssue, checkNumber, checkRepo, createIssue, merge, type ActResult } from '@/lib/act';
import { forgetAll } from '@/lib/memo';

/**
 * Approve, merge and new-issue buttons. Reachable by a direct POST like any server action, so each one checks the
 * Access login again and checks every field from the form (src/lib/act.ts).
 */

const NO_TOKEN = { error: 'Set GITHUB_WRITE_TOKEN (Pull requests, Contents and Issues: Read and write) to act from here.' };

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
    if (!token) return NO_TOKEN;
    if (!repo || !number) return { error: 'Unknown pull request.' };
    return done(await merge(token, repo, number));
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
