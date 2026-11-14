import { requireAdmin } from '@/lib/access';
import { loadNeon, loadToday } from '../_data';
import { Analytics, Neon } from '../_sections/Analytics';
import { Minutes, Versions } from '../_sections/Usage';
import { PageTitle, Problem } from '../_sections/ui';

export const metadata = { title: 'Usage' };

/** What the sites and the tools around them use: traffic, Workers, Actions minutes, Neon and package versions. */
export default async function Usage() {
    await requireAdmin();
    const [t, neon] = await Promise.all([loadToday(), loadNeon()]);
    return (
        <>
            <PageTitle>Usage</PageTitle>
            {t.usage.problem && <Problem>{t.usage.problem}</Problem>}
            <div className="mt-10">
                <Analytics rows={t.rows} data={t.analytics.data} problem={t.analytics.problem} setup={t.analytics.setup} />
                {t.usage.minutes && <Minutes m={t.usage.minutes} />}
                <Neon projects={neon.projects} problem={neon.problem} setup={neon.setup} />
                {!t.problem && <Versions repos={t.repos} />}
            </div>
        </>
    );
}
