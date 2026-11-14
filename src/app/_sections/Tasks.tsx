import { askHref } from '@/lib/vscode';
import type { Task } from '@/lib/today';
import { OWNER, PROJECTS } from '../../../lighthouse.config';
import { approvePr, mergeBatch, mergePr, rerun, runDeploy } from '../act';
import { incidentHelp } from '../ask';
import { ActButton } from './Act';
import { Ask } from './Ask';
import { ProjectIcon } from './ProjectIcon';
import { Dot, ext, link, panel } from './ui';

// The deploy runs in Claude Code, following the written steps; Lighthouse only opens the session (CLAUDE.md)
const deployPrompt = (repo: string) =>
    `Deploy ${repo} from this PC: follow ${process.cwd()}/docs/deploy-from-pc.md step by step, and tell me what production was missing before you deploy.`;

export const DeployLink = ({ repo }: { repo: string }) => (
    <a className={`${link} text-fg`} href={askHref(deployPrompt(repo))} title="Opens Claude Code in VS Code with the deploy steps">Deploy from this PC</a>
);

const repoOf = (project: string) => PROJECTS.find(p => p.name === project)?.repo;

/** Where a task's repo sits on this PC, so Claude Code works in the right folder whichever one VS Code has open. */
const folder = (repo: string) => `${process.cwd().replace(/[\\/][^\\/]+$/, '')}/${repo}`;

/** A new issue for this task, on the Work page's form, filled in. */
const issueHref = (t: Task, repo: string) => `/work?${new URLSearchParams({ repo, title: [t.action, t.title].filter(Boolean).join(' '), body: `${t.detail}\n\n${t.href}` })}#new-issue`;

/**
 * The to-do list. `compact` (the Overview): one line each, no buttons. Otherwise each task carries what can be done
 * from here: Approve and Merge for a PR, Merge passing for a Dependabot batch, Re-run for failed checks, Run deploy,
 * the incident helper for a site that is down, a new issue, and, when `local` (`npm run dev`), links that open Claude Code.
 */
export function Tasks({ tasks, compact, local }: { tasks: Task[]; compact?: boolean; local?: boolean }) {
    return (
        <ul className={panel}>
            {tasks.map(t => { const repo = repoOf(t.project); return (
                <li key={`${t.project} ${t.action} ${t.title}`} className={`grid gap-x-4 gap-y-1 px-4 sm:grid-cols-[minmax(0,1fr)_auto] ${compact ? 'py-3' : 'py-4'}`}>
                    <a {...ext} href={t.href} className="group flex min-w-0 items-start gap-3 text-[15px]">
                        {/* mt-2 centres the light on the first line */}
                        <Dot light={t.level === 1 ? 'bad' : 'warn'} className="mt-2" />
                        <span className={`min-w-0 group-hover:underline group-hover:underline-offset-4 ${compact ? 'truncate' : ''}`}>
                            <span className="font-medium">{t.action}</span>
                            {t.title && <span className="text-fg-muted"> {t.title}</span>}
                        </span>
                    </a>
                    <span className="flex items-center gap-2 pl-5 text-sm text-fg-muted sm:justify-end sm:pl-0"><ProjectIcon project={t.project} className="size-4 text-[8px]" />{t.project}</span>
                    {!compact && (
                        <div className="grid gap-2 pl-5 sm:col-span-2">
                            <p className="flex flex-wrap gap-x-3 text-sm text-fg-muted">
                                <span className="w-full sm:w-auto">{t.detail}</span>
                                {local && t.deploy && <DeployLink repo={t.deploy} />}
                                {local && repo && t.fix && <a className={`${link} text-fg`} href={askHref(`Work in ${folder(repo)}. ${t.fix}`)} title="Opens Claude Code in VS Code with a prompt for this">Fix with Claude</a>}
                                {/* Only work that lives on GitHub (a PR, a release, a repo) is something Claude Code can pick up */}
                                {local && !t.deploy && !t.fix && t.href.startsWith(`https://github.com/${OWNER}/`) && <a className={link} href={askHref(`${t.action} ${t.title ?? ''} in ${t.project}: ${t.href}`)} title="Opens Claude Code in VS Code with this as the prompt">Ask Claude</a>}
                                {repo && !t.pr && !t.batch && <a className={link} href={issueHref(t, repo)}>File an issue</a>}
                            </p>
                            {(t.rerun || t.dispatch || t.batch) && (
                                <div className="flex flex-wrap gap-3">
                                    {t.rerun && <ActButton action={rerun} label="Re-run failed jobs" fields={t.rerun} />}
                                    {t.dispatch && <ActButton action={runDeploy} label="Run deploy" fields={t.dispatch} confirm={`Run ${t.dispatch.workflow} on main in ${t.dispatch.repo}? It deploys the site and uses Actions minutes.`} />}
                                    {t.batch && <ActButton action={mergeBatch} label={`Merge ${t.batch.prs.length} passing`} fields={{ repo: t.batch.repo, prs: t.batch.prs.map(pr => `${pr.number}:${pr.sha}`).join(',') }} confirm={`Merge ${t.batch.prs.map(pr => `#${pr.number}`).join(', ')} into main in ${t.batch.repo}? Each deploys where the repo deploys on merge.`} />}
                                </div>
                            )}
                            {t.pr && (
                                <div className="flex flex-wrap gap-3">
                                    {/* GitHub won't let you approve your own PR (Claude's run as you), so Approve is only for others' */}
                                    {!t.pr.mine && <ActButton action={approvePr} label="Approve" fields={{ repo: t.pr.repo, number: String(t.pr.number) }} />}
                                    {t.pr.canMerge && <ActButton action={mergePr} label="Merge" fields={{ repo: t.pr.repo, number: String(t.pr.number), sha: t.pr.sha }} confirm={`Merge #${t.pr.number} into main in ${t.pr.repo}? Merging deploys where the repo deploys on merge.`} />}
                                </div>
                            )}
                            {t.incidentRepo && <Ask action={incidentHelp} label="Ask Claude why it is down" note="One Claude call" fields={{ repo: t.incidentRepo }} />}
                        </div>
                    )}
                </li>
            ); })}
        </ul>
    );
}

