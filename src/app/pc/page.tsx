import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/access';
import { readSessions } from '@/lib/claude';
import { readLocalRepos } from '@/lib/local';
import { OWNER } from '../../../lighthouse.config';
import { loadToday } from '../_data';
import { ClaudeSessions } from '../_sections/Claude';
import { Git } from '../_sections/Pc';
import { liveText } from '../_sections/Sites';
import { DeployLink } from '../_sections/Tasks';
import { Dot, ext, link, PageTitle, panel, Section } from '../_sections/ui';

export const metadata = { title: 'This PC' };

/** Local only (`npm run dev`): what this PC can see and do. On the Worker there is no PC, so no page. */
export default async function ThisPc() {
    await requireAdmin();
    const [pc, sessions, t] = await Promise.all([readLocalRepos(), readSessions(), loadToday()]);
    if (!pc || !sessions) notFound();
    const behind = t.sites.filter(s => s.live && s.live.state !== 'live');
    return (
        <>
            <PageTitle sub={pc.root}>This PC</PageTitle>
            <div className="mt-10">
                <Section title="Deploys" aside={<a className={link} {...ext} href={`https://github.com/${OWNER}/checkwork-lighthouse/blob/main/docs/deploy-from-pc.md`}>How it works</a>}>
                    {behind.length ? (
                        <ul className={`${panel} text-sm`}>
                            {behind.map(({ p, live, worker }) => (
                                <li key={p.repo} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                                    <Link href={`/projects/${p.repo}`} className="flex items-center gap-3 hover:underline hover:underline-offset-4">
                                        <Dot light={live!.state === 'behind' ? 'warn' : 'ok'} />
                                        <span className="font-medium">{p.name}</span>
                                        <span className="text-fg-muted">{liveText(live)}</span>
                                    </Link>
                                    {live!.state === 'behind' && worker && <DeployLink repo={p.repo} />}
                                </li>
                            ))}
                        </ul>
                    ) : <p className="mt-3 text-sm text-fg-muted">{t.deploys.setup ?? 'Every site runs its latest main or release'}</p>}
                </Section>
                <ClaudeSessions sessions={sessions} />
                <Git repos={pc.repos} />
            </div>
        </>
    );
}
