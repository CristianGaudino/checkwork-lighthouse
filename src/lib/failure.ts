import { z } from 'zod';
import { OWNER } from '../../lighthouse.config';
import { FAILED } from './github';

/**
 * Why a commit's checks failed, from its Actions runs: the first failed job and step, the job's error notes and the end
 * of its log up to the last error. For the task (main or a PR failing), its Fix with Claude prompt and the PR page.
 */
export type Failure = { workflow: string; job: string; step: string | null; href: string; notes: string[]; log: string[] };

const Runs = z.object({ workflow_runs: z.array(z.object({ id: z.number(), name: z.string().nullable(), conclusion: z.string().nullable() })) });
const Jobs = z.object({
    jobs: z.array(z.object({
        id: z.number(), name: z.string(), conclusion: z.string().nullable(), html_url: z.string().nullable(),
        steps: z.array(z.object({ name: z.string(), conclusion: z.string().nullable() })).optional(),
    })),
});
const Notes = z.array(z.object({ message: z.string(), annotation_level: z.string().nullable(), path: z.string().nullable(), start_line: z.number().nullable() }));

const LINES = 25;

/**
 * The lines that say why: up to and including the last `##[error]` line (or the end), without timestamps, colours or
 * group markers. Separate from the fetch so it can be tested.
 */
export function logTail(text: string, lines = LINES): string[] {
    const clean = text.split(/\r?\n/)
        .map(l => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(/\x1b\[[0-9;]*m/g, '').trimEnd())
        .filter(l => l && !/^##\[(end)?group\]/.test(l));
    const last = clean.findLastIndex(l => l.startsWith('##[error]'));
    const end = last < 0 ? clean.length : last + 1;
    return clean.slice(Math.max(0, end - lines), end).map(l => l.replace(/^##\[error\]/, 'Error: '));
}

/** The notes worth reading: errors and warnings, not GitHub's generic "Process completed with exit code 1". */
export const usefulNotes = (notes: z.infer<typeof Notes>) =>
    notes.filter(n => n.annotation_level !== 'notice' && !/^Process completed with exit code \d+\.?$/.test(n.message))
        .slice(0, 5)
        .map(n => `${n.path && n.path !== '.github' ? `${n.path}${n.start_line ? `:${n.start_line}` : ''}: ` : ''}${n.message}`);

/** For Fix with Claude: where it failed and what it said, short enough for a vscode:// link. */
export const failureText = (f: Failure) =>
    [`It failed in ${f.workflow}, job ${f.job}${f.step ? `, step ${f.step}` : ''}.`, ...f.notes, f.log.length ? `End of the log:\n${f.log.slice(-12).join('\n')}` : '']
        .filter(Boolean).join('\n').slice(0, 1500);

const get = (token: string, url: string) => fetch(url.startsWith('https://') ? url : `https://api.github.com/repos/${OWNER}/${url}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'lighthouse' },
    signal: AbortSignal.timeout(10_000),
});

/**
 * The first failed job on a commit, or null when nothing failed. Throws when GitHub refuses the runs or jobs. The notes
 * (Checks: Read) and the log (Actions: Read, a redirect to the file) are extras: either refused leaves it empty.
 */
export async function fetchFailure(token: string, repo: string, sha: string): Promise<Failure | null> {
    const runs = await get(token, `${repo}/actions/runs?head_sha=${sha}&per_page=20`);
    if (!runs.ok) throw new Error(`GitHub runs for ${repo}: ${runs.status}`);
    const run = Runs.parse(await runs.json()).workflow_runs.find(r => FAILED.has(r.conclusion ?? ''));
    if (!run) return null;
    const jobs = await get(token, `${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=50`);
    if (!jobs.ok) throw new Error(`GitHub jobs for ${repo}: ${jobs.status}`);
    const job = Jobs.parse(await jobs.json()).jobs.find(j => FAILED.has(j.conclusion ?? ''));
    if (!job) return null;
    const [notes, log] = await Promise.all([
        get(token, `${repo}/check-runs/${job.id}/annotations`).then(async r => (r.ok ? usefulNotes(Notes.parse(await r.json())) : []), () => []),
        // shortcut: reads the whole log to keep its end; fine for CI logs of a few MB, ask for a byte range if one ever gets huge
        get(token, `${repo}/actions/jobs/${job.id}/logs`).then(async r => (r.ok ? logTail(await r.text()) : []), () => []),
    ]);
    return {
        workflow: run.name ?? 'A workflow', job: job.name, step: job.steps?.find(s => FAILED.has(s.conclusion ?? ''))?.name ?? null,
        href: job.html_url ?? `https://github.com/${OWNER}/${repo}/actions/runs/${run.id}`, notes, log,
    };
}
