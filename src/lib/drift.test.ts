import { expect, it } from 'vitest';
import type { RepoStatus } from './github';
import { buildDrift, floor } from './drift';
import { readVersions } from './github';

const p = (name: string) => ({ name, repo: name, site: `${name}.ie`, project: 1 });
const repo = (versions: Record<string, string>): RepoStatus => ({ prs: [], release: null, versions });

it('reads the floor of a version spec', () => {
    expect([floor('^16.4.5'), floor('16.4.1'), floor('^4'), floor('>=24 <25'), floor('latest')]).toEqual([[16, 4, 5], [16, 4, 1], [4], [24], []]);
});

it('reads tracked packages and Node from package.json, and survives a broken one', () => {
    const text = JSON.stringify({ dependencies: { next: '16.4.5', lodash: '1' }, devDependencies: { wrangler: '^4.151.3' }, engines: { node: '>=24 <25' } });
    expect(readVersions(text)).toEqual({ Next: '16.4.5', Wrangler: '^4.151.3', Node: '>=24 <25' });
    expect(readVersions('{oops')).toEqual({});
    expect(readVersions(null)).toEqual({});
});

it('marks what is behind the newest declared version, without flagging a loose ^4', () => {
    const { labels, newest, rows } = buildDrift(
        [p('a'), p('b'), p('c'), p('gone')],
        [repo({ Next: '16.4.5', Tailwind: '^4' }), repo({ Next: '16.4.1', Tailwind: '^4.3.4', TypeScript: '^5' }), repo({}), null],
    );
    expect(labels).toEqual(['Next', 'Tailwind', 'TypeScript']);
    expect(newest).toEqual({ Next: '16.4.5', Tailwind: '4.3.4', TypeScript: '5.0.0' });
    expect(rows.map(r => r.repo)).toEqual(['a', 'b']); // no package.json and unreadable repos are left out
    expect(rows[0].cells.Tailwind).toEqual({ spec: '^4', behind: false });
    expect(rows[0].issueHref).toBeNull();
    expect(rows[1].cells.Next).toEqual({ spec: '16.4.1', behind: true });
    const issue = new URL(rows[1].issueHref!);
    expect(issue.pathname).toBe('/CristianGaudino/b/issues/new');
    expect(issue.searchParams.get('title')).toBe('Update a dependency to match the other repos');
    expect(issue.searchParams.get('body')).toContain('- Next: 16.4.1, newest in use 16.4.5');
});
