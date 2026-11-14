import { automationGaps, COLUMNS, fetchBoardItems, fetchIssueLinks, groupBoard } from '@/lib/board';
import { askHref } from '@/lib/claude';
import { memo, MINUTE } from '@/lib/memo';
import { PROJECTS } from '../../../lighthouse.config';
import { ext, link, Problem, Section, Setup } from './ui';

/**
 * Open work on the project boards: what is moving, what waits for review, what is next, and each backlog's size.
 * `project`: one project's name, for its own page; otherwise every board.
 */
export async function Board({ local, project }: { local: boolean; project?: string }) {
    const token = process.env.GITHUB_PROJECTS_TOKEN;
    if (!token) return <Section title="Board"><Setup>Set GITHUB_PROJECTS_TOKEN (a classic token with only read:project) to see the boards.</Setup></Section>;
    let board, gaps;
    try {
        const [items, links] = await Promise.all([
            memo('board', MINUTE, () => fetchBoardItems(PROJECTS, token)),
            process.env.GITHUB_TOKEN ? memo('issue-links', MINUTE, () => fetchIssueLinks(PROJECTS, process.env.GITHUB_TOKEN!)) : new Map<string, string>(),
        ]);
        board = groupBoard(PROJECTS, items, links);
        gaps = project ? [] : automationGaps(PROJECTS, items);
    } catch (error) {
        console.error('Could not load the boards', error);
        return <Section title="Board"><Problem>GitHub did not answer, so the board is missing. Reload in a minute.</Problem></Section>;
    }
    const cards = (c: (typeof COLUMNS)[number]) => board.columns[c].filter(card => !project || card.project === project);
    const backlog = board.backlog.filter(b => !project || b.project === project);
    return (
        <Section id="board" title="Board" aside={backlog.length > 0 && (
            project
                ? <a {...ext} className={link} href={backlog[0].href}>Backlog {backlog[0].count}</a>
                : `Backlog ${backlog.reduce((sum, b) => sum + b.count, 0)}`
        )}>
            {/* items-start: a short column stays short instead of stretching to the longest */}
            <div className="mt-3 grid items-start gap-4 lg:grid-cols-3">
                {COLUMNS.map(c => {
                    const list = cards(c);
                    return (
                        <div key={c} className="rounded-2xl border border-line">
                            <h3 className="flex items-baseline justify-between border-b border-line px-4 py-2 text-sm font-medium">
                                {c}<span className="font-normal text-fg-muted tabular-nums">{list.length}</span>
                            </h3>
                            {list.length ? (
                                <ul className="divide-y divide-line">
                                    {list.slice(0, SHOWN).map(card => (
                                        <li key={`${card.project} ${card.title}`} className="px-4 py-3 text-sm">
                                            <a {...ext} href={card.href} className="hover:underline hover:underline-offset-4">{card.title}</a>
                                            <span className="mt-0.5 flex flex-wrap gap-x-3 text-fg-muted">
                                                {!project && <span>{card.project}</span>}
                                                {card.kind && <span>{card.kind}</span>}
                                                {local && <a className={link} href={askHref(`Work on "${card.title}" in ${card.project}: ${card.href}`)} title="Opens Claude Code in VS Code with this as the prompt">Ask Claude</a>}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="px-4 py-3 text-sm text-fg-muted">Nothing here</p>}
                            {list.length > SHOWN && <p className="border-t border-line px-4 py-3 text-sm text-fg-muted">And {list.length - SHOWN} more on the boards</p>}
                        </div>
                    );
                })}
            </div>
            {!project && backlog.length > 0 && (
                <p className="mt-3 text-sm text-fg-muted">
                    Backlogs:{' '}
                    {backlog.map((b, i) => <span key={b.project}>{i > 0 && ', '}<a {...ext} className={link} href={b.href}>{b.project} {b.count}</a></span>)}
                </p>
            )}
            {gaps.length > 0 && (
                <details className="mt-2 text-sm text-fg-muted">
                    <summary className="cursor-pointer hover:text-fg">Automations off on {gaps.length === 1 ? '1 board' : `${gaps.length} boards`}</summary>
                    <ul className="mt-2 grid gap-1 pl-4">
                        {gaps.map(g => <li key={g.project}><a {...ext} className={link} href={g.href}>{g.project}</a>: {g.off.join(', ')}</li>)}
                    </ul>
                </details>
            )}
        </Section>
    );
}

// Long columns stop here; the full list is a click away on each board
const SHOWN = 6;
