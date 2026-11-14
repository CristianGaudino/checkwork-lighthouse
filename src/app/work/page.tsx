import { Suspense } from 'react';
import { requireAdmin } from '@/lib/access';
import { PROJECTS } from '../../../lighthouse.config';
import { loadToday } from '../_data';
import { newIssue } from '../act';
import { NewIssue } from '../_sections/Act';
import { Board } from '../_sections/Board';
import { Tasks } from '../_sections/Tasks';
import { PageTitle, Problem, Section } from '../_sections/ui';

export const metadata = { title: 'Work' };

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v.slice(0, 2000) : undefined);

export default async function Work(props: PageProps<'/work'>) {
    await requireAdmin();
    // A task's File an issue link fills the form in; the action checks every field again
    const q = await props.searchParams;
    const start = { repo: one(q.repo), title: one(q.title), body: one(q.body) };
    const local = process.env.NODE_ENV === 'development';
    const t = await loadToday();
    return (
        <>
            <PageTitle sub={t.tasks.length ? 'Worst first' : undefined}>{t.tasks.length ? `${t.tasks.length} to do` : 'Nothing to do'}</PageTitle>
            {[t.problem, t.uptime.problem].filter(Boolean).map(text => <Problem key={text}>{text}</Problem>)}
            <div className="mt-10">
                {t.tasks.length > 0 && <Section title="To do"><Tasks tasks={t.tasks} local={local} /></Section>}
                <NewIssue action={newIssue} repos={PROJECTS.map(p => ({ repo: p.repo, name: p.name }))} start={start} />
                <Suspense fallback={<Section title="Board"><p className="mt-3 text-sm text-fg-muted">Loading</p></Section>}>
                    <Board local={local} />
                </Suspense>
            </div>
        </>
    );
}
