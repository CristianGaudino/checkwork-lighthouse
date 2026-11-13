import { requireAdmin } from '@/lib/access';
import { fetchRepos, type PullRequest, type RepoStatus } from '@/lib/github';
import { ago, buildRows, CHECK_LABEL, REVIEW_LABEL, type Row } from '@/lib/today';
import { OWNER, PROJECTS } from '../../lighthouse.config';

export const metadata = { title: 'Today' };

async function loadRepos(): Promise<{ repos: RepoStatus[]; problem?: string }> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { repos: [], problem: 'GITHUB_TOKEN is not set, so there is no GitHub data.' };
    try {
        return { repos: await fetchRepos(PROJECTS, token) };
    } catch (error) {
        console.error('Could not load GitHub', error);
        return { repos: [], problem: 'GitHub did not answer. Showing projects without it.' };
    }
}

export default async function Today() {
    await requireAdmin();
    const { repos, problem } = await loadRepos();
    const rows = buildRows(PROJECTS, repos);
    const ready = !problem;
    const needs = ready ? rows.filter(r => r.attention < 3).length : 0;
    const prCount = rows.reduce((n, r) => n + (r.repoStatus?.prs.length ?? 0), 0);

    return (
        <>
            <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div>
                    <p className="text-sm text-fg-muted">Lighthouse</p>
                    <h1 className="text-3xl font-semibold sm:text-4xl">{!ready ? 'Today' : needs ? `${needs} need${needs > 1 ? '' : 's'} you` : 'All quiet'}</h1>
                </div>
                {ready && <p className="text-sm text-fg-muted">{rows.length} projects · {prCount} open PR{prCount === 1 ? '' : 's'}</p>}
            </header>

            {problem && <p role="status" className="mb-6 rounded-xl border border-warn/40 px-4 py-3 text-sm text-warn">{problem}</p>}

            <ul className="grid gap-3">
                {rows.map(row => <ProjectRow key={row.repo} row={row} ready={ready} />)}
            </ul>
        </>
    );
}

function ProjectRow({ row, ready }: { row: Row; ready: boolean }) {
    const r = row.repoStatus;
    const tone = !ready ? 'bg-fg-muted' : row.attention === 1 ? 'bg-bad' : row.attention === 2 ? 'bg-warn' : 'bg-ok';
    return (
        <li className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="flex items-center gap-2.5 text-lg font-semibold">
                    <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${tone}`} />
                    {row.name}
                </h2>
                <p className="flex gap-4 text-sm">
                    <a className="text-fg-muted underline-offset-4 hover:text-fg hover:underline" href={`https://${row.site}`}>{row.site.replace(/^www\./, '')}</a>
                    <a className="text-fg-muted underline-offset-4 hover:text-fg hover:underline" href={`https://github.com/${OWNER}/${row.repo}`}>Repo</a>
                    <a className="text-fg-muted underline-offset-4 hover:text-fg hover:underline" href={`https://github.com/users/${OWNER}/projects/${row.project}`}>Board</a>
                </p>
            </div>

            {ready && (
                <>
                    {row.reasons.length > 0 && <p className="mt-2 text-sm text-fg">{row.reasons.join(' · ')}</p>}
                    {r?.release
                        ? <p className="mt-1 text-sm text-fg-muted">Latest {r.release.tag}{r.release.date && `, ${ago(r.release.date)}`}</p>
                        : r && <p className="mt-1 text-sm text-fg-muted">No releases yet</p>}
                    {r && r.prs.length > 0 && (
                        <ul className="mt-3 divide-y divide-line border-t border-line">
                            {r.prs.map(pr => <PrItem key={pr.number} pr={pr} />)}
                        </ul>
                    )}
                </>
            )}
        </li>
    );
}

const CHECK_TONE: Record<PullRequest['checks'], string> = { passing: 'text-ok', failing: 'text-bad', running: 'text-warn', none: 'text-fg-muted' };

function PrItem({ pr }: { pr: PullRequest }) {
    return (
        <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
            <a href={pr.url} className="min-w-0 flex-1 underline-offset-4 hover:underline">
                <span className="text-fg-muted">#{pr.number}</span> {pr.title}{pr.draft && <span className="text-fg-muted"> (draft)</span>}
            </a>
            <span className="flex gap-3 text-fg-muted">
                <span>{pr.author}</span>
                <span>{REVIEW_LABEL[pr.review]}</span>
                <span className={CHECK_TONE[pr.checks]}>{CHECK_LABEL[pr.checks]}</span>
                <span>{ago(pr.updatedAt)}</span>
            </span>
        </li>
    );
}
