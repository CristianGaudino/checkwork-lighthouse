import { notFound } from 'next/navigation';
import { adminEmail, requireAdmin } from '@/lib/access';
import { checkNumber } from '@/lib/act';
import { fetchFailure } from '@/lib/failure';
import { memo, MINUTE } from '@/lib/memo';
import { fetchActionChecks, fetchPr, fetchPreview, type Check } from '@/lib/pr';
import { ago, canMerge } from '@/lib/today';
import { OWNER } from '../../../../../../lighthouse.config';
import { approvePr, mergePr } from '../../../../act';
import { loadProjects, loadToday } from '../../../../_data';
import { ActButton } from '../../../../_sections/Act';
import { FailureDetail } from '../../../../_sections/Failure';
import { Gate } from '../../../../_sections/Gate';
import { Markdown } from '../../../../_sections/Markdown';
import { Dot, ext, link, n, num, PageTitle, panel, Problem, Section } from '../../../../_sections/ui';

type Props = PageProps<'/projects/[repo]/pr/[number]'>;

const target = async (props: Props) => {
    const { repo, number } = await props.params;
    const project = (await loadProjects()).find(p => p.repo === repo);
    const num = checkNumber(number);
    return project && num ? { project, number: num } : null;
};

export async function generateMetadata(props: Props) {
    // Repo names are private: none in the title until the Access login checks out
    if (!(await adminEmail())) return {};
    const t = await target(props);
    return { title: t ? `#${t.number} ${t.project.name}` : 'Not found' };
}

/** One PR, so Merge is an informed tap: what changed, how the checks went and why one failed, what reviewers said. */
export default async function Page(props: Props) {
    if (!(await target(props))) notFound();
    return <Gate><PullRequest {...props} /></Gate>;
}

const LIGHT: Record<Check['state'], 'ok' | 'bad' | 'warn' | null> = { passing: 'ok', failing: 'bad', running: 'warn', skipped: null };
const SAID: Record<Check['state'], string> = { passing: 'Passed', failing: 'Failed', running: 'Running', skipped: 'Skipped' };
const REVIEW: Record<string, string> = { APPROVED: 'approved', CHANGES_REQUESTED: 'asked for changes', COMMENTED: 'commented', DISMISSED: 'review dismissed' };

async function PullRequest(props: Props) {
    await requireAdmin();
    const { project: p, number } = (await target(props))!;
    const token = process.env.GITHUB_TOKEN;
    if (!token) return <Problem>Set GITHUB_TOKEN on the Worker (or in .env.local) to see pull requests.</Problem>;
    const [pr, today] = await Promise.all([
        memo(`pr ${p.repo} ${number}`, MINUTE, () => fetchPr(token, p.repo, number)).catch(error => { console.error('Could not load the PR', error); return undefined; }),
        loadToday(),
    ]);
    if (pr === undefined) return <Problem>GitHub did not answer, so this pull request is missing. Reload in a minute.</Problem>;
    if (!pr) notFound();

    // Extras, each quiet on failure: checks from Actions where GraphQL gave none, why one failed, and a preview
    const quiet = <T,>(what: string, load: Promise<T>) => load.catch(error => { console.warn(`Could not load ${what}`, error); return null; });
    const [actionChecks, preview] = await Promise.all([
        pr.checks || !pr.sha ? null : quiet('Actions checks', memo(`pr checks ${pr.sha}`, MINUTE, () => fetchActionChecks(token, p.repo, pr.sha!))),
        pr.sha ? quiet('the preview', memo(`preview ${pr.sha}`, 5 * MINUTE, () => fetchPreview(token, p.repo, pr.sha!))) : null,
    ]);
    const checks = pr.checks ?? actionChecks ?? [];
    const failing = checks.some(c => c.state === 'failing');
    const failure = failing && pr.sha ? await quiet('why checks failed', memo(`failure ${pr.sha}`, MINUTE, () => fetchFailure(token, p.repo, pr.sha!))) : null;

    // Merge and Approve follow the task list's rules, from the same picture of the repo
    const status = today.repos[today.rows.findIndex(r => r.repo === p.repo)];
    const listed = status?.prs.find(x => x.number === number);
    const open = pr.state === 'OPEN';
    // Never beside a failing check: the page's own reading wins over the task list's minute-old one
    const mergeable = open && !pr.draft && !failing && listed?.sha === pr.sha && listed && status ? canMerge(listed, status.checksPrs) : false;
    const verdict = !open ? `${pr.state[0]}${pr.state.slice(1).toLowerCase()}` : pr.draft ? 'Draft' : failing ? 'Checks fail' : checks.some(c => c.state === 'running') ? 'Checks running' : mergeable ? 'Ready to merge' : 'Open';

    return (
        <>
            <PageTitle sub={
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                    <a className={link} href={`/projects/${p.repo}`}>{p.name}</a>
                    <span>{pr.author === OWNER ? 'Yours' : `From ${pr.author}`}, {pr.branch}</span>
                    <a {...ext} className={link} href={pr.url}>On GitHub</a>
                    {preview && <a {...ext} className={`${link} text-fg`} href={preview}>Preview</a>}
                </span>
            }>
                <span className="text-fg-muted">#{pr.number}</span> {pr.title}
            </PageTitle>

            <div className="mt-6 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-2 text-sm"><Dot light={failing ? 'bad' : mergeable ? 'ok' : 'warn'} />{verdict}</span>
                {open && !pr.draft && listed && pr.author !== OWNER && <ActButton action={approvePr} label="Approve" fields={{ repo: p.repo, number: String(number) }} />}
                {mergeable && pr.sha && <ActButton action={mergePr} label="Merge" fields={{ repo: p.repo, number: String(number), sha: pr.sha }} confirm={`Merge #${number} into main in ${p.repo}? Merging deploys where the repo deploys on merge.`} />}
            </div>

            <div className="mt-10">
                <Section title="Checks" aside={checks.length ? `${checks.filter(c => c.state === 'passing').length} of ${checks.length} passed` : undefined}>
                    {checks.length ? (
                        <ul className={`${panel} text-sm`}>
                            {checks.map((c, i) => (
                                <li key={`${c.name} ${i}`} className="flex items-center justify-between gap-4 px-4 py-2">
                                    <span className="flex min-w-0 items-center gap-3"><Dot light={LIGHT[c.state]} /><span className="truncate">{c.name}</span></span>
                                    {c.href ? <a {...ext} className={`${link} shrink-0 text-fg-muted`} href={c.href}>{SAID[c.state]}</a> : <span className="shrink-0 text-fg-muted">{SAID[c.state]}</span>}
                                </li>
                            ))}
                        </ul>
                    ) : <p className="mt-3 text-sm text-fg-muted">No checks on the newest commit.</p>}
                    {failure && <div className="mt-3 rounded-2xl border border-bad/40 px-4 py-3"><FailureDetail failure={failure} /></div>}
                </Section>

                <Section title="Files" aside={<><span className="text-ok">+{num.format(pr.additions)}</span> <span className="text-bad">−{num.format(pr.deletions)}</span></>}>
                    <ul className={`${panel} text-sm tabular-nums`}>
                        {pr.files.map(f => (
                            <li key={f.path} className="flex items-center justify-between gap-4 px-4 py-2">
                                <a {...ext} className={`${link} min-w-0 truncate font-mono text-xs`} href={`${pr.url}/files`} title={f.path}>
                                    {f.change !== 'modified' && <span className="mr-2 font-sans text-fg-muted">{f.change[0].toUpperCase() + f.change.slice(1)}</span>}{f.path}
                                </a>
                                <span className="shrink-0 text-xs"><span className="text-ok">+{f.additions}</span> <span className="text-bad">−{f.deletions}</span></span>
                            </li>
                        ))}
                    </ul>
                    {pr.moreFiles > 0 && <p className="mt-2 text-sm text-fg-muted">And {n(pr.moreFiles, 'more file')}, <a {...ext} className={link} href={`${pr.url}/files`}>on GitHub</a>.</p>}
                </Section>

                {pr.body.trim() && (
                    <Section title="Description">
                        <div className="mt-3 max-w-3xl text-sm leading-relaxed"><Markdown text={pr.body} /></div>
                    </Section>
                )}

                <Section title="Conversation" aside={pr.comments.length ? n(pr.comments.length, 'comment') : undefined}>
                    {pr.comments.length ? (
                        <ul className={panel}>
                            {pr.comments.map(c => (
                                <li key={c.url} className="grid gap-2 px-4 py-3 text-sm">
                                    <p className="text-fg-muted"><span className="font-medium text-fg">{c.author}</span> {c.state ? REVIEW[c.state] ?? 'reviewed' : 'commented'}, <a {...ext} className={link} href={c.url}>{c.at ? ago(c.at) : 'pending'}</a></p>
                                    {c.body.trim() && <div className="min-w-0 leading-relaxed"><Markdown text={c.body} /></div>}
                                </li>
                            ))}
                        </ul>
                    ) : <p className="mt-3 text-sm text-fg-muted">No reviews or comments yet.</p>}
                </Section>
            </div>
        </>
    );
}
