import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/access';
import { askHref, readSessions } from '@/lib/claude';
import { siteKey } from '@/lib/cloudflare';
import { readLocalRepos } from '@/lib/local';
import { severe } from '@/lib/security';
import { setupChecks } from '@/lib/setup';
import { ago } from '@/lib/today';
import { OWNER, PROJECTS } from '../../../../lighthouse.config';
import { loadToday } from '../../_data';
import { Board } from '../../_sections/Board';
import { ClaudeSessions } from '../../_sections/Claude';
import { Git } from '../../_sections/Pc';
import { liveText, uptimeText, Week } from '../../_sections/Sites';
import { DeployLink, Tasks } from '../../_sections/Tasks';
import { Versions } from '../../_sections/Usage';
import { Dot, ext, link, num, PageTitle, panel, Problem, Section } from '../../_sections/ui';

const find = (repo: string) => PROJECTS.findIndex(p => p.repo === repo);
const date = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export async function generateMetadata(props: PageProps<'/projects/[repo]'>) {
    const i = find((await props.params).repo);
    return { title: i < 0 ? 'Not found' : PROJECTS[i].name };
}

/** Everything about one project on one page: how its site is doing, what it needs, its board, and this PC's side of it. */
export default async function Project(props: PageProps<'/projects/[repo]'>) {
    await requireAdmin();
    const i = find((await props.params).repo);
    if (i < 0) notFound();
    const local = process.env.NODE_ENV === 'development';
    const [t, pc, sessions] = await Promise.all([loadToday(), readLocalRepos(), readSessions()]);
    const { p, live, worker, light, alerts, expires } = t.sites[i];
    const traffic = t.analytics.data?.traffic.get(siteKey(p.site));
    const w = worker ? t.analytics.data?.workers.get(worker) : undefined;
    const release = p.repoStatus?.release;
    const tasks = t.tasks.filter(x => x.project === p.name);
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
                    <a {...ext} className={link} href={`https://${p.site}`}>{p.site.replace(/^www\./, '')}</a>
                    <a {...ext} className={link} href={gh}>Repo</a>
                    <a {...ext} className={link} href={`https://github.com/users/${OWNER}/projects/${p.project}`}>Board</a>
                    <a {...ext} className={link} href={`${gh}/actions`}>Actions</a>
                    {local && live?.state === 'behind' && worker && <DeployLink repo={p.repo} />}
                </span>
            }>
                <span className="flex items-center gap-3"><Dot light={t.problem ? null : light} className="size-2.5" />{p.name}</span>
            </PageTitle>
            {t.problem && <Problem>{t.problem}</Problem>}

            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-sm tabular-nums sm:grid-cols-4">
                {facts.map(([label, value, tone]) => (
                    <div key={label} className="bg-canvas px-4 py-3">
                        <dt className="text-xs text-fg-muted">{label}</dt>
                        <dd className={`mt-1 ${tone ?? ''}`}>{value}</dd>
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

                {tasks.length > 0 && <Section title="Needs you"><Tasks tasks={tasks} local={local} /></Section>}

                <Suspense fallback={<Section title="Board"><p className="mt-3 text-sm text-fg-muted">Loading</p></Section>}>
                    <Board local={local} project={p.name} />
                </Suspense>

                {traffic && traffic.topPaths.length > 0 && (
                    <Section title="Top pages" aside="Page views, 7 days">
                        <ul className={`${panel} text-sm tabular-nums`}>
                            {traffic.topPaths.map(tp => (
                                <li key={tp.path} className="flex justify-between gap-4 px-4 py-2">
                                    <span className="truncate">{tp.path}</span><span className="text-fg-muted">{num.format(tp.views)}</span>
                                </li>
                            ))}
                        </ul>
                    </Section>
                )}

                {!t.problem && <Versions repos={t.repos} only={p.repo} />}

                {sessions && <ClaudeSessions title="Claude sessions" sessions={sessions.filter(s => s.repo === p.repo)} />}
                {pc?.repos.some(r => r.name === p.repo) && <Git title="On this PC" repos={pc.repos.filter(r => r.name === p.repo)} />}
            </div>
        </>
    );
}
