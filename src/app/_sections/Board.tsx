import { automationGaps, COLUMNS, fetchBoardItems, fetchIssueLinks, groupBoard } from '@/lib/board';
import { askHref } from '@/lib/claude';
import { PROJECTS } from '../../../lighthouse.config';
import { ext, Heading, link, Problem, Setup } from './ui';

/** Open work across every project board: what is moving, what waits for review, what is next, and each backlog's size. */
export async function Board({ local }: { local: boolean }) {
    const token = process.env.GITHUB_PROJECTS_TOKEN;
    if (!token) return <Section><Setup>Set GITHUB_PROJECTS_TOKEN (a classic token with only read:project) to see the boards.</Setup></Section>;
    let board, gaps;
    try {
        const [items, links] = await Promise.all([
            fetchBoardItems(PROJECTS, token),
            process.env.GITHUB_TOKEN ? fetchIssueLinks(PROJECTS, process.env.GITHUB_TOKEN) : new Map<string, string>(),
        ]);
        board = groupBoard(PROJECTS, items, links);
        gaps = automationGaps(PROJECTS, items);
    } catch (error) {
        console.error('Could not load the boards', error);
        return <Section><Problem>GitHub did not answer, so the board is missing. Reload in a minute.</Problem></Section>;
    }
    return (
        <Section>
            <div className="mt-4 grid gap-6 lg:grid-cols-3">
                {COLUMNS.map(c => (
                    <div key={c}>
                        <h3 className="flex items-baseline justify-between border-b border-line pb-2 text-sm font-medium">
                            {c}<span className="font-normal text-fg-muted tabular-nums">{board.columns[c].length}</span>
                        </h3>
                        {board.columns[c].length ? (
                            <ul className="divide-y divide-line">
                                {board.columns[c].slice(0, SHOWN).map(card => (
                                    <li key={`${card.project} ${card.title}`} className="py-3 text-sm">
                                        <a {...ext} href={card.href} className="hover:underline hover:underline-offset-4">{card.title}</a>
                                        <span className="mt-0.5 flex flex-wrap gap-x-3 text-fg-muted">
                                            <span>{card.kind ? `${card.project}, ${card.kind}` : card.project}</span>
                                            {local && <a className={link} href={askHref(`Work on "${card.title}" in ${card.project}: ${card.href}`)} title="Opens Claude Code in your VS Code window with this as the prompt">Ask Claude</a>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="py-3 text-sm text-fg-muted">Nothing here</p>}
                        {board.columns[c].length > SHOWN && <p className="border-t border-line py-3 text-sm text-fg-muted">And {board.columns[c].length - SHOWN} more on the boards</p>}
                    </div>
                ))}
            </div>
            {board.backlog.length > 0 && (
                <p className="mt-4 text-sm text-fg-muted">
                    Backlog:{' '}
                    {board.backlog.map((b, i) => (
                        <span key={b.project}>{i > 0 && ', '}<a {...ext} className={link} href={b.href}>{b.project} {b.count}</a></span>
                    ))}
                </p>
            )}
            {gaps.length > 0 && (
                <p className="mt-2 text-sm text-fg-muted">
                    Board automations off that other projects use:{' '}
                    {gaps.map((g, i) => (
                        <span key={g.project}>{i > 0 && '; '}<a {...ext} className={link} href={g.href}>{g.project}</a> ({g.off.join(', ')})</span>
                    ))}
                </p>
            )}
        </Section>
    );
}

// Long columns stop here; the full list is a click away on each board
const SHOWN = 6;

const Section = ({ children }: { children: React.ReactNode }) => (
    <section>
        <Heading id="board">Board</Heading>
        {children}
    </section>
);
