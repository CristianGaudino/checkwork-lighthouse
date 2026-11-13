import { Suspense } from 'react';
import { requireAdmin } from '@/lib/access';
import type { RepoStatus } from '@/lib/github';
import { ago, span, type Light, type ProjectState, type Task } from '@/lib/today';
import type { Uptime } from '@/lib/uptime';
import { buildDrift } from '@/lib/drift';
import { needsLook, readLocalRepos, type LocalRepo } from '@/lib/local';
import { INCLUDED, type Minutes } from '@/lib/minutes';
import { askHref, readSessions } from '@/lib/claude';
import { OWNER, PROJECTS } from '../../lighthouse.config';
import { loadNeon, loadToday } from './_data';
import { Analytics, Neon } from './_sections/Analytics';
import { Board } from './_sections/Board';
import { ClaudeSessions } from './_sections/Claude';
import { cell, ext, Heading, link, Problem } from './_sections/ui';
import { Ask } from './_sections/Ask';
import { incidentHelp, morningBrief } from './ask';
import { MODEL } from '@/lib/ask';

export const metadata = { title: 'Today' };

const STATE: Record<Uptime['state'], string> = { up: 'Up', down: 'Down', paused: 'Paused', unknown: 'Checking' };

function uptimeText(u: Uptime | null | undefined) {
    if (u === undefined) return '';
    if (!u) return 'No monitor';
    return u.seconds === null || u.state === 'paused' || u.state === 'unknown' ? STATE[u.state] : `${STATE[u.state]} for ${span(u.seconds)}`;
}

const LIGHT: Record<Light, string> = { bad: 'bg-bad', warn: 'bg-warn', ok: 'bg-ok' };

export default async function Today() {
    await requireAdmin();
    const [{ repos, problem, uptime, usage, analytics, tasks, projects, rows }, local, sessions, neon] = await Promise.all([loadToday(), readLocalRepos(), readSessions(), loadNeon()]);
    const jumps = [['board', 'Board'], ['projects', 'Projects'], sessions && ['claude', 'Claude'], local && ['this-pc', 'This PC'], ['traffic', 'Traffic'], ['neon', 'Neon'], usage.minutes && ['minutes', 'Actions'], !problem && ['versions', 'Versions']]
        .filter((j): j is string[] => Array.isArray(j));
    const heading = tasks.length === 0 && (problem || uptime.problem) ? 'Today' : tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'thing needs' : 'things need'} you` : 'Nothing needs you';

    return (
        <>
            <h1 className="text-4xl font-semibold sm:text-5xl">{heading}</h1>
            <nav aria-label="Sections" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
                {jumps.map(([id, label]) => <a key={id} className={link} href={`#${id}`}>{label}</a>)}
            </nav>
            <Ask action={morningBrief} label="Write my morning brief" note={`One Claude call (${MODEL}), a few cents, only when pressed`} />

            {[problem, uptime.problem, usage.problem].filter(Boolean).map(text => <Problem key={text}>{text}</Problem>)}
            {tasks.length > 0 && (
                    <ul className="mt-8 divide-y divide-line border-y border-line">
                        {tasks.map(t => <TaskItem key={`${t.project} ${t.action} ${t.title}`} task={t} local={Boolean(local)} />)}
                    </ul>
                )}

            <Suspense fallback={<p className="mt-14 text-sm text-fg-muted">Loading the board</p>}>
                <Board local={Boolean(local)} />
            </Suspense>

            <Heading id="projects">Projects</Heading>
            <ul className="mt-4 divide-y divide-line border-y border-line">
                {projects.map(p => <ProjectItem key={p.repo} p={p} known={!problem} />)}
            </ul>

            {sessions && <ClaudeSessions sessions={sessions} />}

            {local && <ThisPc root={local.root} repos={local.repos} />}

            <Analytics rows={rows} data={analytics.data} problem={analytics.problem} setup={analytics.setup} />

            <Neon projects={neon.projects} problem={neon.problem} setup={neon.setup} />

            {usage.minutes && <ActionsMinutes m={usage.minutes} />}

            {!problem && <Versions repos={repos} />}
        </>
    );
}

const num = new Intl.NumberFormat('en-IE');
const day = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** The shared Actions allowance: one bar for the month (the accent, amber when on pace to go over), then each repo's share. */
function ActionsMinutes({ m }: { m: Minutes }) {
    const pct = (x: number) => `${Math.min(100, (x / INCLUDED) * 100)}%`;
    const over = m.projected > INCLUDED;
    const lastDay = new Date(m.monthEnd.getTime() - 86_400_000);
    const top = Math.max(...m.byRepo.map(r => r.minutes));
    return (
        <>
            <Heading id="minutes">Actions minutes</Heading>
            <p className="mt-1 text-sm text-fg-muted tabular-nums">
                <span className="text-fg">{num.format(m.used)}</span> of {num.format(INCLUDED)} used this month by private repos, on pace for{' '}
                <span className={over ? 'text-warn' : 'text-fg'}>{num.format(m.projected)}</span> by {day.format(lastDay)}
            </p>
            <div className="relative mt-4 h-2 max-w-3xl rounded-full bg-surface" role="img" aria-label={`${num.format(m.used)} of ${num.format(INCLUDED)} minutes used, on pace for ${num.format(m.projected)}`}>
                {/* The projection sits behind the used bar as a faint extension */}
                <div className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-warn/30' : 'bg-accent/30'}`} style={{ width: pct(m.projected) }} />
                <div className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-warn' : 'bg-accent'}`} style={{ width: pct(m.used) }} />
            </div>
            {m.byRepo.length > 0 && (
                <ul className="mt-6 grid max-w-3xl gap-2 text-sm tabular-nums">
                    {m.byRepo.map(r => (
                        <li key={r.repo} className={`grid grid-cols-[minmax(8rem,12rem)_1fr_7rem] items-center gap-4 ${r.free ? 'text-fg-muted' : ''}`}>
                            <span>{r.repo}</span>
                            <span className={`h-1 rounded-full ${r.free ? 'bg-fg-muted/15' : 'bg-fg-muted/40'}`} style={{ width: `${(r.minutes / top) * 100}%` }} />
                            <span className="text-right text-fg-muted">{r.free ? `${num.format(r.minutes)}, free` : num.format(r.minutes)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Local only (`npm run dev`): repos on this PC with work not yet committed, pushed or pulled, and branches to tidy. */
function ThisPc({ root, repos }: { root: string; repos: LocalRepo[] }) {
    const look = repos.filter(needsLook);
    const clean = repos.length - look.length;
    return (
        <>
            <Heading id="this-pc">This PC</Heading>
            <p className="mt-1 text-sm text-fg-muted">
                {root}, as of each repo&apos;s last fetch. {look.length ? `${n(clean, 'other repo is', 'other repos are')} clean.` : `All ${repos.length} repos are clean.`}
            </p>
            {look.length > 0 && (
                <ul className="mt-4 divide-y divide-line border-y border-line">
                    {look.map(r => {
                        const now = [
                            r.changed && n(r.changed, 'file changed', 'files changed'),
                            r.ahead && `${n(r.ahead, 'commit')} to push`,
                            r.behind && `${n(r.behind, 'commit')} to pull`,
                        ].filter(Boolean);
                        return (
                            <li key={r.name} className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(10rem,14rem)_1fr]">
                                <span className="text-base font-medium">{r.name}</span>
                                <div className="grid gap-1">
                                    <p><span className="text-fg-muted">On {r.branch}</span>{now.length > 0 && <span>, {now.join(', ')}</span>}</p>
                                    <Branches label="Never pushed" names={r.notPushed} />
                                    <Branches label="Remote deleted" names={r.goneRemote} />
                                    <Branches label="No commits in 30 days" names={r.old} />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
}

/** A few branch names inline; a long list (often leftover worktree branches) collapses to a count you can open. */
function Branches({ label, names }: { label: string; names: string[] }) {
    if (!names.length) return null;
    if (names.length <= 3) return <p className="text-fg-muted">{label}: {names.join(', ')}</p>;
    return (
        <details className="text-fg-muted">
            <summary className="cursor-pointer hover:text-fg">{label}: {n(names.length, 'branch', 'branches')}</summary>
            <p className="mt-1 pl-4">{names.join(', ')}</p>
        </details>
    );
}

/** Declared versions per repo; amber where a repo asks for less than the newest any repo uses. */
function Versions({ repos }: { repos: RepoStatus[] }) {
    const { labels, newest, rows } = buildDrift(PROJECTS, repos);
    if (!rows.length) return null;
    return (
        <>
            <Heading id="versions">Versions</Heading>
            <p className="mt-1 text-sm text-fg-muted">What each package.json asks for. Amber is behind the newest version another repo uses.</p>
            {/* relative: keeps the sr-only header (absolutely positioned) inside the scroll box instead of widening the page */}
            <div className="relative mt-4 overflow-x-auto border-y border-line">
                <table className="w-full whitespace-nowrap text-left text-sm tabular-nums">
                    <thead className="text-fg-muted">
                        <tr className="border-b border-line">
                            <th scope="col" className={`${cell} align-top font-medium`}>Project</th>
                            {labels.map(l => (
                                <th key={l} scope="col" className={`${cell} align-top font-medium`}>{l}<span className="block font-normal">{newest[l]}</span></th>
                            ))}
                            <th scope="col" className={cell}><span className="sr-only">Issue</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {rows.map(r => (
                            <tr key={r.repo}>
                                <th scope="row" className={`${cell} font-medium`}>{r.project}</th>
                                {labels.map(l => {
                                    const c = r.cells[l];
                                    return <td key={l} className={`${cell} ${c?.behind ? 'text-warn' : 'text-fg-muted'}`}>{c ? c.spec : ''}</td>;
                                })}
                                <td className={`${cell} text-right`}>
                                    {r.issueHref && <a {...ext} className={`${link} text-fg-muted`} href={r.issueHref}>File issue</a>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

/** `local`: running under `npm run dev`, where an Ask Claude link can open Claude Code in VS Code with the task as its prompt. */
function TaskItem({ task, local }: { task: Task; local: boolean }) {
    return (
        <li className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:gap-x-6">
            <a {...ext} href={task.href} className="group flex min-w-0 items-start gap-3 text-base">
                {/* mt-2 centres the 8px light on the first 24px line */}
                <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${task.level === 1 ? 'bg-bad' : 'bg-warn'}`} />
                <span className="min-w-0 group-hover:underline group-hover:underline-offset-4">
                    <span className="font-medium">{task.action}</span>
                    {task.title && <span className="text-fg-muted"> {task.title}</span>}
                </span>
            </a>
            <span className="pl-5 text-sm text-fg-muted sm:row-span-2 sm:pl-0 sm:text-right">{task.project}</span>
            <p className="flex flex-wrap gap-x-3 pl-5 text-sm text-fg-muted">
                <span>{task.detail}</span>
                {/* Only work that lives on GitHub (a PR, a release, a repo) is something Claude Code can pick up */}
                {local && task.href.startsWith(`https://github.com/${OWNER}/`) && <a className={link} href={askHref(`${task.action} ${task.title ?? ''} in ${task.project}: ${task.href}`)} title="Opens Claude Code in your VS Code window with this as the prompt">Ask Claude</a>}
            </p>
            {task.incidentRepo && <div className="pl-5 sm:col-span-2"><Ask action={incidentHelp} label="Ask Claude why it is down" note="Reads recent commits and deploys, one call" fields={{ repo: task.incidentRepo }} /></div>}
        </li>
    );
}

function ProjectItem({ p, known }: { p: ProjectState; known: boolean }) {
    const release = p.repoStatus?.release;
    return (
        <li className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(10rem,14rem)_minmax(8rem,11rem)_1fr_auto] sm:items-baseline">
            <span className="flex items-center gap-3 text-base font-medium">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${known ? LIGHT[p.light] : 'bg-fg-muted'}`} />
                {p.name}
            </span>
            <span className={`pl-5 sm:pl-0 ${p.uptime?.state === 'down' ? 'text-bad' : 'text-fg-muted'}`}>{uptimeText(p.uptime)}</span>
            <span className="pl-5 text-fg-muted sm:pl-0">
                {!known ? '' : release ? `${release.tag}, ${release.date ? ago(release.date) : 'date unknown'}` : 'Not released yet'}
            </span>
            <span className="flex gap-4 pl-5 text-fg-muted sm:pl-0">
                <a {...ext} className={link} href={`https://${p.site}`}>{p.site.replace(/^www\./, '')}</a>
                <a {...ext} className={link} href={`https://github.com/${OWNER}/${p.repo}`}>Repo</a>
                <a {...ext} className={link} href={`https://github.com/users/${OWNER}/projects/${p.project}`}>Board</a>
            </span>
        </li>
    );
}
