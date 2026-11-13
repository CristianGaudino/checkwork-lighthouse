import { expect, it } from 'vitest';
import { automationGaps, groupBoard } from './board';

const p = (name: string, project: number) => ({ name, repo: name, site: `${name}.ie`, project });
const item = (title: string, status: string | null, content: object | null = null, type = 'ISSUE') => ({ type, title: { text: title }, status: status ? { name: status } : null, content });

it('sorts items into columns, counts backlog per project, and links each card as well as it can', () => {
    const board = groupBoard(
        [p('pub', 7), p('priv', 3), p('gone', 9)],
        [
            { workflows: [], items: [item('Public issue', 'Todo', { url: 'https://github.com/o/pub/issues/1', issueType: { name: 'Bug' } }), item('A PR', 'In Review', { url: 'https://github.com/o/pub/pull/2' }, 'PULL_REQUEST'), item('Later', 'Backlog')] },
            { workflows: [], items: [item('Matched private', 'In Progress', {}), item('Unmatched private', 'Todo', {}), item('No status', null), item('Odd status', 'Blocked'), { junk: 1 }] },
            null,
        ],
        new Map([['priv Matched private', 'https://github.com/o/priv/issues/5']]),
    );
    expect(board.columns['In Progress']).toEqual([{ project: 'priv', title: 'Matched private', href: 'https://github.com/o/priv/issues/5', kind: null }]);
    expect(board.columns['In Review']).toEqual([{ project: 'pub', title: 'A PR', href: 'https://github.com/o/pub/pull/2', kind: 'PR' }]);
    expect(board.columns.Todo.map(c => [c.title, c.href, c.kind])).toEqual([
        ['Public issue', 'https://github.com/o/pub/issues/1', 'Bug'],
        ['Unmatched private', 'https://github.com/users/CristianGaudino/projects/3', null],
    ]);
    expect(board.backlog).toEqual([
        { project: 'pub', count: 1, href: 'https://github.com/users/CristianGaudino/projects/7' },
        { project: 'priv', count: 2, href: 'https://github.com/users/CristianGaudino/projects/3' },
    ]);
});

it('lists automations a project has off that another project uses', () => {
    const wf = (on: string[], off: string[] = []) => ({ items: [], workflows: [...on.map(name => ({ name, enabled: true })), ...off.map(name => ({ name, enabled: false }))] });
    expect(automationGaps([p('full', 3), p('gaps', 7), p('gone', 9)], [wf(['Auto-add to project', 'Item closed']), wf(['Item closed'], ['Auto-add to project']), null])).toEqual([
        { project: 'gaps', off: ['Auto-add to project'], href: 'https://github.com/users/CristianGaudino/projects/7/workflows' },
    ]);
});
