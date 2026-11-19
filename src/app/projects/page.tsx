import Link from 'next/link';
import { requireAdmin } from '@/lib/access';
import { STATUS_MEANS } from '@/lib/repos';
import { Gate } from '../_sections/Gate';
import { askHref } from '@/lib/vscode';
import { setRepoStatus } from '../act';
import { loadToday } from '../_data';
import { StatusPicker } from '../_sections/Act';
import { ProjectIcon } from '../_sections/ProjectIcon';
import { Sites } from '../_sections/Sites';
import { link, n, PageTitle, panel, Problem } from '../_sections/ui';

export const metadata = { title: 'Projects' };

export default function Page() {
    return <Gate><Projects /></Gate>;
}

const summary = 'cursor-pointer text-sm font-medium text-fg-muted hover:text-fg';
const row = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3';

async function Projects() {
    await requireAdmin();
    const t = await loadToday();
    const local = process.env.NODE_ENV === 'development';
    return (
        <>
            <PageTitle sub={
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>{n(t.sites.length, 'project')}. Open one for everything about it</span>
                    {local && <a className={`${link} text-fg`} href={askHref(`Add a new site to Lighthouse: follow ${process.cwd()}/docs/new-site.md step by step. Ask me for the repo and address first.`)} title="Opens Claude Code in VS Code with the steps for a new site">Add a site</a>}
                </span>
            }>Projects</PageTitle>
            {t.problem && <Problem>{t.problem}</Problem>}
            <div className="mt-10">
                <Sites rows={t.sites} analytics={t.analytics.data} known={!t.problem} />
            </div>
            <details className="mt-6">
                <summary className={summary}>Set a status</summary>
                <p className="mt-2 text-sm text-fg-muted">{STATUS_MEANS}</p>
                <ul className={`${panel} text-sm`}>
                    {t.sites.map(({ p, status }) => (
                        <li key={p.repo} className={row}>
                            <span className="flex min-w-0 items-center gap-3"><ProjectIcon project={p.repo} /><span className="truncate">{p.name}</span></span>
                            <StatusPicker action={setRepoStatus} repo={p.repo} status={status} />
                        </li>
                    ))}
                </ul>
            </details>
            {t.archived.length > 0 && (
                <details className="mt-4">
                    <summary className={summary}>Archived ({t.archived.length})</summary>
                    <ul className={`${panel} text-sm`}>
                        {t.archived.map(p => (
                            <li key={p.repo} className={row}>
                                <Link href={`/projects/${p.repo}`} className={`${link} flex min-w-0 items-center gap-3`}><ProjectIcon project={p.repo} /><span className="truncate">{p.name}</span></Link>
                                <StatusPicker action={setRepoStatus} repo={p.repo} status={p.status} />
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </>
    );
}
