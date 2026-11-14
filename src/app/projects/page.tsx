import { requireAdmin } from '@/lib/access';
import { loadToday } from '../_data';
import { Sites } from '../_sections/Sites';
import { n, PageTitle, Problem } from '../_sections/ui';

export const metadata = { title: 'Projects' };

export default async function Projects() {
    await requireAdmin();
    const t = await loadToday();
    return (
        <>
            <PageTitle sub={`${n(t.sites.length, 'site')}. Open one for everything about it`}>Projects</PageTitle>
            {t.problem && <Problem>{t.problem}</Problem>}
            <div className="mt-10">
                <Sites rows={t.sites} analytics={t.analytics.data} known={!t.problem} />
            </div>
        </>
    );
}
