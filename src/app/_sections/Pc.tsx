import { needsLook, type LocalRepo } from '@/lib/local';
import { n, panel, Section } from './ui';

/** Local only (`npm run dev`): repos on this PC with work not yet committed, pushed or pulled, and branches to tidy. */
export function Git({ repos, title = 'Git' }: { repos: LocalRepo[]; title?: string }) {
    const look = repos.filter(needsLook);
    return (
        <Section id="git" title={title} aside={look.length && repos.length > look.length ? `${n(repos.length - look.length, 'other repo')} clean` : undefined}>
            {look.length ? (
                <ul className={panel}>
                    {look.map(r => {
                        const now = [
                            r.changed && n(r.changed, 'file changed', 'files changed'),
                            r.ahead && `${n(r.ahead, 'commit')} to push`,
                            r.behind && `${n(r.behind, 'commit')} to pull`,
                        ].filter(Boolean);
                        return (
                            <li key={r.name} className="grid gap-x-6 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[minmax(9rem,12rem)_1fr]">
                                <span className="font-medium">{r.name}</span>
                                <div className="grid gap-1">
                                    <p><span className="text-fg-muted">On {r.branch}</span>{now.length > 0 && <span>, {now.join(', ')}</span>}</p>
                                    <Branches label="Never pushed" names={r.notPushed} />
                                    <Branches label="Remote deleted" names={r.goneRemote} />
                                    <Branches label="No commits in 30 days" names={r.old} />
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : <p className="mt-3 text-sm text-fg-muted">{repos.length === 1 ? 'Clean, nothing to push or pull' : `All ${repos.length} repos clean`}</p>}
        </Section>
    );
}

/** A few branch names inline; a long list (often leftover worktree branches) collapses to a count you can open. */
function Branches({ label, names }: { label: string; names: string[] }) {
    if (!names.length) return null;
    if (names.length <= 3) return <p className="text-fg-muted">{label}: {names.join(', ')}</p>;
    return (
        <details className="text-fg-muted">
            <summary className="cursor-pointer hover:text-fg">{label}: {n(names.length, 'branch', 'branches')}</summary>
            <p className="mt-1 pl-4">{names.join(', ')}</p>
        </details>
    );
}
