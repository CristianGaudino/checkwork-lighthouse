import { expect, it } from 'vitest';
import { checkState, parsePr } from './pr';
import { envNames, missingOnWorker } from './secrets';
import { errorQuery, rowsOf, topErrors } from './werrors';

it('reads a PR: files, checks of both kinds, and reviews with comments oldest first', () => {
    const pr = parsePr({
        number: 7, title: 'T', url: 'https://github.com/o/r/pull/7', body: 'b', isDraft: false, state: 'OPEN', headRefName: 'feat/x',
        additions: 10, deletions: 2, changedFiles: 3, author: null,
        files: { nodes: [{ path: 'a.ts', additions: 10, deletions: 2, changeType: 'MODIFIED' }] },
        commits: { nodes: [{ commit: { oid: 'abc', statusCheckRollup: { contexts: { nodes: [
            { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'd' },
            { __typename: 'StatusContext', context: 'Vercel', state: 'SUCCESS', targetUrl: 'v' },
            {},
        ] } } } }] },
        reviews: { nodes: [{ author: { login: 'x' }, state: 'APPROVED', body: '', submittedAt: '2026-11-02T00:00:00Z', url: 'r' }, { author: { login: 'y' }, state: 'COMMENTED', body: '', submittedAt: '2026-11-03T00:00:00Z', url: 'r2' }] },
        comments: { nodes: [{ author: { login: 'z' }, body: 'hi', createdAt: '2026-11-01T00:00:00Z', url: 'c' }] },
    });
    expect(pr).toMatchObject({ author: 'ghost', sha: 'abc', moreFiles: 2, files: [{ path: 'a.ts', change: 'modified' }] });
    expect(pr!.checks).toEqual([{ name: 'test', state: 'failing', href: 'd' }, { name: 'Vercel', state: 'passing', href: 'v' }]);
    // The empty COMMENTED review is the shell of an inline comment: left out
    expect(pr!.comments.map(c => c.author)).toEqual(['z', 'x']);
    expect(parsePr(null)).toBeNull();
    expect([checkState('IN_PROGRESS', null), checkState('COMPLETED', 'SKIPPED'), checkState('completed', 'timed_out'), checkState('PENDING', null)]).toEqual(['running', 'skipped', 'failing', 'running']);
});

it('lists the .env.example names the Worker lacks, leaving out built-in NEXT_PUBLIC_ ones', () => {
    const names = envNames('# a comment\nDATABASE_URL=\n# OLD=1\nexport CRON_SECRET=x\nNEXT_PUBLIC_KEY=pk\n lower=1\n');
    expect(names).toEqual(['DATABASE_URL', 'CRON_SECRET', 'NEXT_PUBLIC_KEY']);
    expect(missingOnWorker(names, new Set(['DATABASE_URL']))).toEqual(['CRON_SECRET']);
    expect(envNames(null)).toEqual([]);
});

it('groups Worker errors by Worker, top five each, and marks ones not seen before the deploy', () => {
    const rows = rowsOf({ result: { calculations: [{ aggregates: [
        { count: 9, value: 9, groups: [{ key: '$metadata.service', value: 'w' }, { key: '$metadata.error', value: 'boom' }] },
        { count: 3, groups: [{ key: '$metadata.service', value: 'w' }, { key: '$metadata.error', value: 'old' }] },
        { count: 1, groups: [{ key: '$metadata.service', value: 'v' }, { key: '$metadata.error', value: 'x' }] },
    ] }] } });
    expect(rows[1]).toEqual({ by: { '$metadata.service': 'w', '$metadata.error': 'old' }, count: 3 });
    const top = topErrors(rows, new Map([['w', new Set(['old'])]]));
    expect(top.get('w')).toEqual([{ message: 'boom', count: 9, fresh: true }, { message: 'old', count: 3, fresh: false }]);
    // No window before the deploy to compare with: nothing is called new
    expect(top.get('v')).toEqual([{ message: 'x', count: 1, fresh: false }]);
    expect(rowsOf({ result: {} })).toEqual([]);
    expect(errorQuery(0, 1, ['a'], 'w').parameters.filters).toHaveLength(2);
});
