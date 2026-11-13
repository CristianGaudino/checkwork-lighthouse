import { requireAdmin } from '@/lib/access';
import { fetchRepos, type RepoStatus } from '@/lib/github';
import { ago, buildBoard, type Light, type ProjectState, type Task } from '@/lib/today';
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

const LIGHT: Record<Light, string> = { bad: 'bg-bad', warn: 'bg-warn', ok: 'bg-ok' };
const link = 'underline-offset-4 hover:text-fg hover:underline';

export default async function Today() {
    await requireAdmin();
    const { repos, problem } = await loadRepos();
    const { tasks, projects } = buildBoard(PROJECTS, repos);
    const heading = problem ? 'Lighthouse' : tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'thing needs' : 'things need'} you` : 'Nothing needs you';

    return (
        <>
            <h1 className="text-4xl font-semibold sm:text-5xl">{heading}</h1>

            {problem
                ? <p role="status" className="mt-6 max-w-2xl rounded-xl border border-warn/40 px-4 py-3 text-sm text-warn">{problem}</p>
                : tasks.length > 0 && (
                    <ul className="mt-8 divide-y divide-line border-y border-line">
                        {tasks.map(t => <TaskItem key={t.href + t.action} task={t} />)}
                    </ul>
                )}

            <h2 className="mt-14 text-xl font-semibold">Projects</h2>
            <ul className="mt-4 divide-y divide-line border-y border-line">
                {projects.map(p => <ProjectItem key={p.repo} p={p} known={!problem} />)}
            </ul>
        </>
    );
}

function TaskItem({ task }: { task: Task }) {
    return (
        <li className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:gap-x-6">
            <a href={task.href} className="group flex min-w-0 items-start gap-3 text-base">
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
        <li className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(10rem,14rem)_1fr_auto] sm:items-baseline">
            <span className="flex items-center gap-3 text-base font-medium">
                <span aria-hidden className={`size-2 shrink-0 rounded-full ${known ? LIGHT[p.light] : 'bg-fg-muted'}`} />
                {p.name}
            </span>
            <span className="pl-5 text-fg-muted sm:pl-0">
                {!known ? '' : release ? `${release.tag}, ${release.date ? ago(release.date) : 'date unknown'}` : 'Not released yet'}
            </span>
            <span className="flex gap-4 pl-5 text-fg-muted sm:pl-0">
                <a className={link} href={`https://${p.site}`}>{p.site.replace(/^www\./, '')}</a>
                <a className={link} href={`https://github.com/${OWNER}/${p.repo}`}>Repo</a>
                <a className={link} href={`https://github.com/users/${OWNER}/projects/${p.project}`}>Board</a>
            </span>
        </li>
    );
}
