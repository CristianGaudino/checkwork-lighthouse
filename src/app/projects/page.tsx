import { requireAdmin } from '@/lib/access';
import { askHref } from '@/lib/claude';
import { loadToday } from '../_data';
import { Sites } from '../_sections/Sites';
import { link, n, PageTitle, Problem } from '../_sections/ui';

export const metadata = { title: 'Projects' };

export default async function Projects() {
    await requireAdmin();
    const t = await loadToday();
    const local = process.env.NODE_ENV === 'development';
    return (
        <>
            <PageTitle sub={
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>{n(t.sites.length, 'site')}. Open one for everything about it</span>
                    {local && <a className={`${link} text-fg`} href={askHref(`Add a new site to Lighthouse: follow ${process.cwd()}/docs/new-site.md step by step. Ask me for the repo and address first.`)} title="Opens Claude Code in VS Code with the steps for a new site">Add a site</a>}
                </span>
            }>Projects</PageTitle>
            {t.problem && <Problem>{t.problem}</Problem>}
            <div className="mt-10">
                <Sites rows={t.sites} analytics={t.analytics.data} known={!t.problem} />
            </div>
        </>
    );
}
