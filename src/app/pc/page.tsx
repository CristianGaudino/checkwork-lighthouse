import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/access';
import { readUsageToday } from '@/lib/claude';
import { readDevServers, readLocalRepos } from '@/lib/local';
import { memo, MINUTE } from '@/lib/memo';
import { OWNER } from '../../../lighthouse.config';
import { loadToday } from '../_data';
import { ClaudeToday } from '../_sections/Claude';
import { Git } from '../_sections/Pc';
import { ProjectIcon } from '../_sections/ProjectIcon';
import { liveText } from '../_sections/Sites';
import { DeployLink } from '../_sections/Tasks';
import { Dot, ext, link, PageTitle, panel, Section } from '../_sections/ui';

export const metadata = { title: 'This PC' };

/** Local only (`npm run dev`): what this PC can see and do. On the Worker there is no PC, so no page. */
export default async function ThisPc() {
    await requireAdmin();
    const [pc, t] = await Promise.all([readLocalRepos(), loadToday()]);
    if (!pc) notFound();
    const [servers, usage] = await Promise.all([
        // A PowerShell call and a read of today's transcripts: remembered briefly, as each page load would repeat them
        memo('dev servers', MINUTE / 2, () => readDevServers(pc.root, pc.repos.map(r => r.name))),
        memo('claude usage', 5 * MINUTE, () => readUsageToday()),
    ]);
    const behind = t.sites.filter(s => s.live && s.live.state !== 'live');
    return (
        <>
            <PageTitle sub={pc.root}>This PC</PageTitle>
            <div className="mt-10">
                {servers && (
                    <Section title="Running here" aside={servers.length ? undefined : 'No dev servers'}>
                        {servers.length > 0 && (
                            <ul className={`${panel} text-sm`}>
                                {servers.map(s => (
                                    <li key={s.repo} className="flex items-center justify-between gap-4 px-4 py-3">
                                        <span className="flex items-center gap-3 font-medium"><ProjectIcon project={s.repo} />{s.repo}</span>
                                        <a {...ext} className={`${link} tabular-nums text-fg-muted`} href={`http://localhost:${s.port}`}>localhost:{s.port}</a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>
                )}
                <Section title="Deploys" aside={<a className={link} {...ext} href={`https://github.com/${OWNER}/checkwork-lighthouse/blob/main/docs/deploy-from-pc.md`}>How it works</a>}>
                    {behind.length ? (
                        <ul className={`${panel} text-sm`}>
                            {behind.map(({ p, live, worker }) => (
                                <li key={p.repo} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                                    <Link href={`/projects/${p.repo}`} className="flex items-center gap-3 hover:underline hover:underline-offset-4">
                                        <Dot light={live!.state === 'behind' ? 'warn' : 'ok'} />
                                        <ProjectIcon project={p.repo} />
                                        <span className="font-medium">{p.name}</span>
                                        <span className="text-fg-muted">{liveText(live)}</span>
                                    </Link>
                                    {live!.state === 'behind' && worker && <DeployLink repo={p.repo} />}
                                </li>
                            ))}
                        </ul>
                    ) : <p className="mt-3 text-sm text-fg-muted">{t.deploys.setup ?? 'Every site runs its latest main or release'}</p>}
                </Section>
                {/* The sessions themselves are on the Claude page */}
                {usage && <ClaudeToday usage={usage} />}
                <Git repos={pc.repos} root={pc.root} />
            </div>
        </>
    );
}
