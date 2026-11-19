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
    // Users only where a Clerk secret is set (clerk: false): a missing one is a setup note on that project's page
    const [t, neon, visitors] = await Promise.all([loadToday(), loadNeon(), loadVisitors()]);
    const users = await Promise.all(t.rows.map(r => loadUsers(r.repo, false)));
    return (
        <>
            <PageTitle>Usage</PageTitle>
            {t.usage.problem && <Problem>{t.usage.problem}</Problem>}
            <div className="mt-10">
                <VisitorsSummary
                    problem={visitors.problem ?? users.find(u => u.problem)?.problem}
                    rows={t.rows.map((r, i) => ({ ...r, traffic: r.site ? t.analytics.data?.traffic.get(siteKey(r.site)) : undefined, visitors: r.site ? visitors.visitors?.get(siteKey(r.site)) : undefined, users: users[i].users }))}
                />
                <Analytics rows={t.rows} data={t.analytics.data} problem={t.analytics.problem} setup={t.analytics.setup} />
                {t.usage.minutes && <Minutes m={t.usage.minutes} />}
                <Neon projects={neon.projects} problem={neon.problem} setup={neon.setup} />
                {!t.problem && <Versions projects={t.rows} repos={t.repos} />}
            </div>
        </>
    );
}
