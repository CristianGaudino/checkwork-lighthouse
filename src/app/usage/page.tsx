import { Suspense } from 'react';
import { requireAdmin } from '@/lib/access';
import { Gate } from '../_sections/Gate';
import { siteKey } from '@/lib/cloudflare';
import { loadNeon, loadToday, loadUsers, loadVisitors } from '../_data';
import { Analytics, Neon } from '../_sections/Analytics';
import { Minutes, Versions } from '../_sections/Usage';
import { VisitorsSummary } from '../_sections/Visitors';
import { PageTitle, Problem } from '../_sections/ui';

export const metadata = { title: 'Usage' };

/** What the sites and the tools around them use: traffic, Workers, Actions minutes, Neon and package versions. */
export default function Page() {
    return <Gate><Usage /></Gate>;
}

async function Usage() {
    await requireAdmin();
    const [t, neon] = await Promise.all([loadToday(), loadNeon()]);
    return (
        <>
            <PageTitle>Usage</PageTitle>
            {t.usage.problem && <Problem>{t.usage.problem}</Problem>}
            <div className="mt-10">
                <Suspense fallback={null}>
                    <Summary />
                </Suspense>
                <Analytics rows={t.rows} data={t.analytics.data} problem={t.analytics.problem} setup={t.analytics.setup} />
                {t.usage.minutes && <Minutes m={t.usage.minutes} />}
                <Neon projects={neon.projects} problem={neon.problem} setup={neon.setup} />
                {!t.problem && <Versions projects={t.rows} repos={t.repos} />}
            </div>
        </>
    );
}

/** Clerk and the visitors query are other services: the page shows without waiting on them. */
async function Summary() {
    const [t, visitors] = await Promise.all([loadToday(), loadVisitors()]);
    // Users only where a Clerk secret is set (clerk: false): a missing one is a setup note on that project's page
    const users = await Promise.all(t.rows.map(r => loadUsers(r.repo, false)));
    const problems = [visitors.problem, ...users.map(u => u.problem)].filter((p): p is string => Boolean(p));
    return <VisitorsSummary problems={problems} rows={t.rows.map((r, i) => ({ ...r, traffic: r.site ? t.analytics.data?.traffic.get(siteKey(r.site)) : undefined, visitors: r.site ? visitors.visitors?.get(siteKey(r.site)) : undefined, users: users[i].users }))} />;
}
