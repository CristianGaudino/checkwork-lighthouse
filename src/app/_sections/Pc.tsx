import { needsLook, type LocalRepo } from '@/lib/local';
import { ProjectIcon } from './ProjectIcon';
import { link, n, panel, Section } from './ui';

/** Local only (`npm run dev`): repos on this PC with work not yet committed, pushed or pulled, and branches to tidy. */
export function Git({ repos, root, title = 'Repos' }: { repos: LocalRepo[]; root: string; title?: string }) {
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
                        // After a pull the lockfile can move on while node_modules stays put, and the next dev server fails in odd ways
                        const install = r.install ? `Run npm install, ${n(r.install, 'package')} out of date` : null;
                        return (
                            <li key={r.name} className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[minmax(9rem,12rem)_1fr_auto]">
                                <span className="flex items-center gap-3 font-medium"><ProjectIcon project={r.name} />{r.name}</span>
                                <a className={`${link} text-fg-muted sm:order-last`} href={`vscode://file/${root.replace(/\\/g, '/')}/${r.name}`}>Open in VS Code</a>
                                <div className="col-span-2 grid gap-1 pl-8 sm:col-span-1 sm:pl-0">
                                    <p><span className="text-fg-muted">On {r.branch}</span>{now.length > 0 && <span>, {now.join(', ')}</span>}</p>
                                    {install && <p className="text-warn">{install}</p>}
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
