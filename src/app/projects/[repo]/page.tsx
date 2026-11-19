import { Suspense } from 'react';
import { Gate } from '../../_sections/Gate';
import { notFound } from 'next/navigation';
import { adminEmail, requireAdmin } from '@/lib/access';
import { readSessions } from '@/lib/claude';
import { usesClerk } from '@/lib/clerk';
import { askHref } from '@/lib/vscode';
import { siteKey, type SiteTraffic } from '@/lib/cloudflare';
import { readLocalRepos } from '@/lib/local';
import { severe } from '@/lib/security';
import { setupChecks } from '@/lib/setup';
import { ago } from '@/lib/today';
import { STATUS_MEANS, type Listed } from '@/lib/repos';
import { OWNER } from '../../../../lighthouse.config';
import { setRepoStatus } from '../../act';
import { loadMissingSettings, loadProjects, loadToday, loadUsers, loadVisitors, loadWorkerErrors } from '../../_data';
import { StatusPicker } from '../../_sections/Act';
import { Board } from '../../_sections/Board';
import { ClaudeSessions } from '../../_sections/Claude';
import { Git } from '../../_sections/Pc';
import { liveText, uptimeText, Week } from '../../_sections/Sites';
import { ProjectIcon } from '../../_sections/ProjectIcon';
import { DeployLink, Tasks } from '../../_sections/Tasks';
import { Versions } from '../../_sections/Usage';
import { SiteUsers, SiteVisitors } from '../../_sections/Visitors';
import { Dot, ext, link, num, PageTitle, panel, Problem, Section, Setup } from '../../_sections/ui';

// Any of the owner's repos, archived ones too: those are hidden from the lists, not gone
const find = async (repo: string) => (await loadProjects()).find(p => p.repo === repo);
const date = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export async function generateMetadata(props: PageProps<'/projects/[repo]'>) {
    // Repo names are private: none in the title until the Access login checks out
    if (!(await adminEmail())) return {};
    const p = await find((await props.params).repo);
    return { title: p ? p.name : 'Not found' };
}

/** Everything about one project on one page: how its site is doing, what it needs, its board, and this PC's side of it. */
export default async function Page(props: PageProps<'/projects/[repo]'>) {
    if (!(await find((await props.params).repo))) notFound();
    return <Gate><Project {...props} /></Gate>;
}

async function Project(props: PageProps<'/projects/[repo]'>) {
    await requireAdmin();
    const listed = await find((await props.params).repo);
    if (!listed) notFound();
    if (listed.status === 'archived') return <Archived p={listed} />;
    const local = process.env.NODE_ENV === 'development';
    const [t, pc, sessions] = await Promise.all([loadToday(), readLocalRepos(), readSessions()]);
    const site = t.sites.find(s => s.p.repo === listed.repo);
    if (!site) notFound();
    const { p, live, worker, light, alerts, expires, status } = site;
    const traffic = p.site ? t.analytics.data?.traffic.get(siteKey(p.site)) : undefined;
    const w = worker ? t.analytics.data?.workers.get(worker) : undefined;
    const release = p.repoStatus?.release;
    const tasks = [...t.tasks, ...t.idle, ...t.muted].filter(x => x.project === p.name);
    const gh = `https://github.com/${OWNER}/${p.repo}`;
    const checks = setupChecks({ repo: p.repoStatus ?? undefined, uptime: p.uptime, analytics: Boolean(t.analytics.data), traffic, live, alerts });
    const missing = checks.filter(c => c.done === false);
    const guide = `https://github.com/${OWNER}/checkwork-lighthouse/blob/main/docs/new-site.md`;

    // The site's vital signs, as a short sheet of label and value
    const facts: [string, React.ReactNode, string?][] = [
        ['Uptime', uptimeText(p.uptime), p.uptime?.state === 'down' ? 'text-bad' : undefined],
        ['Running', live ? `${liveText(live)}, deployed ${ago(live.since)}` : '–', live?.state === 'behind' ? 'text-warn' : undefined],
        ['Release', release ? `${release.tag}, ${release.date ? ago(release.date) : 'date unknown'}` : 'None yet'],
        ['Visits, 7 days', traffic ? <span className="flex items-center gap-3"><Week days={traffic.days} />{num.format(traffic.visits)}</span> : '–'],
        ['Requests, 24 hours', w ? num.format(w.requests) : '–'],
        ['Errors, 24 hours', w ? num.format(w.errors) : '–', w && w.requests && w.errors / w.requests > 0.01 ? 'text-bad' : undefined],
        ['Security alerts', !alerts ? '–' : !alerts.on ? 'Off' : alerts.open.length ? `${alerts.open.length} open${severe(alerts) ? `, ${severe(alerts)} high` : ''}` : 'None open', alerts && severe(alerts) ? 'text-bad' : undefined],
        // .ie publishes no expiry date (no RDAP), so those read as a dash
        ['Domain expires', expires ? date.format(new Date(expires)) : '–'],
    ];

    return (
        <>
            <PageTitle sub={
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                    {p.site && <a {...ext} className={link} href={`https://${p.site}`}>{p.site.replace(/^www\./, '')}</a>}
                    <a {...ext} className={link} href={gh}>Repo</a>
                    {p.project && <a {...ext} className={link} href={`https://github.com/users/${OWNER}/projects/${p.project}`}>Board</a>}
                    <a {...ext} className={link} href={`${gh}/actions`}>Actions</a>
                    {local && live?.state === 'behind' && worker && <DeployLink repo={p.repo} />}
                </span>
            }>
                <span className="flex items-center gap-3"><Dot light={t.problem ? null : light} className="size-2.5" /><ProjectIcon project={p.repo} className="size-9 rounded-lg text-sm" />{p.name}</span>
            </PageTitle>
            {t.problem && <Problem>{t.problem}</Problem>}

            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-sm tabular-nums sm:grid-cols-4">
                {facts.map(([label, value, tone]) => (
                    <div key={label} className="bg-canvas px-4 py-3">
                        <dt className="text-xs text-fg-muted">{label}</dt>
                        <dd className={`mt-1 text-[15px] ${tone ?? ''}`}>{value}</dd>
                    </div>
                ))}
            </dl>

            <div className="mt-10">
                {/* Only when something is missing: a set-up site has nothing to show here */}
                {missing.length > 0 && (
                    <Section title="Setup" aside={`${checks.filter(c => c.done).length} of ${checks.length} done`}>
                        <ul className={`${panel} text-sm`}>
                            {missing.map(c => (
                                <li key={c.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                                    <span><span className="font-medium">{c.label}</span><span className="text-fg-muted"> {c.fix}</span></span>
                                    <a {...ext} className={`${link} text-fg-muted`} href={`${guide}#${c.anchor}`}>How</a>
                                </li>
                            ))}
                        </ul>
                        {local && (
                            <p className="mt-2 text-sm">
                                <a className={link} href={askHref(`Finish setting up ${p.repo} for Lighthouse. Missing: ${missing.map(c => c.label).join(', ')}. Follow ${process.cwd()}/docs/new-site.md for those parts.`)} title="Opens Claude Code in VS Code with the setup steps">Set up with Claude</a>
                            </p>
                        )}
                    </Section>
                )}

                {tasks.length > 0 && <Section title="Needs you"><Suspense fallback={<p className="mt-3 text-sm text-fg-muted">Loading</p>}><Tasks tasks={tasks} local={local} /></Suspense></Section>}

                <Suspense fallback={null}>
                    <WorkerHealth worker={worker} deployedAt={worker ? t.deploys.deployed?.get(worker) : undefined} names={p.repoStatus?.envNames} />
                </Suspense>

                {p.project && (
                    <Suspense fallback={<Section title="Board"><p className="mt-3 text-sm text-fg-muted">Loading</p></Section>}>
                        <Board local={local} project={p.name} />
                    </Suspense>
                )}

                <Suspense fallback={null}>
                    <Audience repo={p.repo} site={p.site} clerk={usesClerk(p.repoStatus?.envNames)} traffic={traffic} />
                </Suspense>

                {!t.problem && <Versions projects={t.rows} repos={t.repos} only={p.repo} />}

                {sessions && <ClaudeSessions title="Claude sessions" oneRepo sessions={sessions.filter(s => s.repo === p.repo)} />}
                {pc?.repos.some(r => r.name === p.repo) && <Git title="On this PC" root={pc.root} repos={pc.repos.filter(r => r.name === p.repo)} />}

                <Section title="Status"><StatusLine repo={p.repo} status={status} /></Section>
            </div>
        </>
    );
}

/** The repo's status and what it means. */
const StatusLine = ({ repo, status }: { repo: string; status: Listed['status'] }) => (
    <div className="mt-3 grid gap-2 text-sm">
        <StatusPicker action={setRepoStatus} repo={repo} status={status} />
        <p className="max-w-2xl text-fg-muted">{STATUS_MEANS}</p>
    </div>
);

/** An archived repo: Lighthouse loads nothing for it, so its page is where to bring it back. */
function Archived({ p }: { p: Listed }) {
    const gh = `https://github.com/${OWNER}/${p.repo}`;
    return (
        <>
            <PageTitle sub={
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                    {p.site && <a {...ext} className={link} href={`https://${p.site}`}>{p.site.replace(/^www\./, '')}</a>}
                    <a {...ext} className={link} href={gh}>Repo</a>
                </span>
            }>
                <span className="flex items-center gap-3"><ProjectIcon project={p.repo} className="size-9 rounded-lg text-sm" />{p.name}</span>
            </PageTitle>
            <p className="mt-6 text-sm text-fg-muted">Archived. Pick another status to bring it back.</p>
            <StatusLine repo={p.repo} status={p.status} />
        </>
    );
}

/** The Worker's settings missing from .env.example and its top errors: each a Cloudflare call, so the page shows without waiting on them. */
async function WorkerHealth({ worker, deployedAt, names }: { worker: string | null; deployedAt: string | undefined; names: string[] | undefined }) {
    const [werrors, unset] = await Promise.all([worker ? loadWorkerErrors(worker, deployedAt) : null, loadMissingSettings(worker, names)]);
    const top = werrors?.errors;
    return (
        <>
                {unset && unset.length > 0 && (
                    <Section title="Worker settings" aside={`${unset.length} not set`}>
                        <p className="mt-3 max-w-2xl text-sm text-fg-muted">In .env.example but not on the {worker} Worker. Some may be optional.</p>
                        <p className="mt-2 flex flex-wrap gap-2">{unset.map(name => <code key={name} className="rounded-md border border-line px-2 py-0.5 font-mono text-xs">{name}</code>)}</p>
                    </Section>
                )}

                {worker && werrors && (top?.length || werrors.setup || werrors.problem) ? (
                    <Section title="Worker errors" aside="24 hours">
                        {werrors.problem && <Problem>{werrors.problem}</Problem>}
                        {werrors.setup && <Setup>{werrors.setup}</Setup>}
                        {top && top.length > 0 && (
                            <ul className={`${panel} text-sm`}>
                                {top.map(e => (
                                    <li key={e.message} className="flex items-baseline justify-between gap-4 px-4 py-2">
                                        <span className="min-w-0">
                                            {e.fresh && <span className="block text-xs text-warn">New since the deploy</span>}
                                            <span className="break-words font-mono text-xs">{e.message}</span>
                                        </span>
                                        <span className="shrink-0 tabular-nums text-fg-muted">{num.format(e.count)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>
                ) : null}
        </>
    );
}

/** Visitors on last week and the site's users: each another call, so the page shows without waiting on them. */
async function Audience({ repo, site, clerk, traffic }: { repo: string; site?: string; clerk: boolean; traffic: SiteTraffic | undefined }) {
    const [v, u] = await Promise.all([loadVisitors(), loadUsers(repo, clerk)]);
    return (
        <>
            <SiteVisitors traffic={traffic} visitors={site ? v.visitors?.get(siteKey(site)) : undefined} problem={traffic ? v.problem : undefined} />
            <SiteUsers {...u} />
        </>
    );
}
