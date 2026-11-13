import { requireAdmin } from '@/lib/access';
import { fetchRepos, type RepoStatus } from '@/lib/github';
import { ago, buildBoard, span, type Light, type ProjectState, type Task } from '@/lib/today';
import { fetchMonitors, matchUptime, type Uptime } from '@/lib/uptime';
import { buildDrift } from '@/lib/drift';
import { OWNER, PROJECTS } from '../../lighthouse.config';

export const metadata = { title: 'Today' };

async function loadRepos(): Promise<{ repos: RepoStatus[]; problem?: string }> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { repos: [], problem: 'No GitHub data: set GITHUB_TOKEN on the Worker (or in .env.local) to see PRs and releases.' };
    try {
        return { repos: await fetchRepos(PROJECTS, token) };
    } catch (error) {
        console.error('Could not load GitHub', error);
        return { repos: [], problem: 'GitHub did not answer, so PRs and releases are missing. Reload in a minute.' };
    }
}

async function loadUptime(): Promise<{ uptimes?: (Uptime | null)[]; problem?: string }> {
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

const STATE: Record<Uptime['state'], string> = { up: 'Up', down: 'Down', paused: 'Paused', unknown: 'Checking' };

function uptimeText(u: Uptime | null | undefined) {
    if (u === undefined) return '';
    if (!u) return 'No monitor';
    return u.seconds === null || u.state === 'paused' || u.state === 'unknown' ? STATE[u.state] : `${STATE[u.state]} for ${span(u.seconds)}`;
}

const LIGHT: Record<Light, string> = { bad: 'bg-bad', warn: 'bg-warn', ok: 'bg-ok' };
const link = 'underline-offset-4 hover:text-fg hover:underline';
// Every link leaves for another site (GitHub, UptimeRobot, the projects), so it opens in a new tab and Lighthouse stays put
const ext = { target: '_blank', rel: 'noreferrer' } as const;

export default async function Today() {
    await requireAdmin();
    const [{ repos, problem }, uptime] = await Promise.all([loadRepos(), loadUptime()]);
    const { tasks, projects } = buildBoard(PROJECTS, problem ? undefined : repos, uptime.uptimes);
    const heading = tasks.length === 0 && (problem || uptime.problem) ? 'Today' : tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'thing needs' : 'things need'} you` : 'Nothing needs you';

    return (
        <>
            <h1 className="text-4xl font-semibold sm:text-5xl">{heading}</h1>

            {[problem, uptime.problem].filter(Boolean).map(text => (
                <p key={text} role="status" className="mt-6 max-w-2xl rounded-xl border border-warn/40 px-4 py-3 text-sm text-warn">{text}</p>
            ))}
            {tasks.length > 0 && (
                    <ul className="mt-8 divide-y divide-line border-y border-line">
                        {tasks.map(t => <TaskItem key={`${t.project} ${t.action} ${t.title}`} task={t} />)}
                    </ul>
                )}

            <h2 className="mt-14 text-xl font-semibold">Projects</h2>
            <ul className="mt-4 divide-y divide-line border-y border-line">
                {projects.map(p => <ProjectItem key={p.repo} p={p} known={!problem} />)}
            </ul>

            {!problem && <Versions repos={repos} />}
        </>
    );
}

/** Declared versions per repo; amber where a repo asks for less than the newest any repo uses. */
function Versions({ repos }: { repos: RepoStatus[] }) {
    const { labels, newest, rows } = buildDrift(PROJECTS, repos);
    if (!rows.length) return null;
    const cell = 'px-3 py-2.5 first:pl-0 last:pr-0';
    return (
        <>
            <h2 className="mt-14 text-xl font-semibold">Versions</h2>
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

function TaskItem({ task }: { task: Task }) {
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
            <p className="pl-5 text-sm text-fg-muted">{task.detail}</p>
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
