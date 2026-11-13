import { expect, it } from 'vitest';
import { buildQuery, parseRepo } from './github';

const pr = (over: object = {}) => ({
    number: 12, title: 'Fix the thing', url: 'https://github.com/o/r/pull/12', isDraft: false, updatedAt: '2026-11-10T09:00:00Z',
    author: { login: 'dev' }, reviewDecision: 'REVIEW_REQUIRED',
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] }, ...over,
});

it('maps PR review and check states, and a deleted author', () => {
    const repo = parseRepo({
        pullRequests: { nodes: [pr(), pr({ author: null, reviewDecision: null, commits: { nodes: [{ commit: { statusCheckRollup: null } }] } })] },
        refs: { nodes: [] },
    });
    expect(repo?.prs.map(p => [p.author, p.review, p.checks])).toEqual([['dev', 'waiting', 'failing'], ['ghost', 'none', 'none']]);
    expect(repo?.release).toBeNull();
});

it('reads the latest tag, from a lightweight or an annotated tag', () => {
    const light = parseRepo({ pullRequests: { nodes: [] }, refs: { nodes: [{ name: 'v1.5.1', compare: { aheadBy: 3 }, target: { committedDate: '2026-11-12T22:43:36Z' } }] } });
    expect(light?.release).toEqual({ tag: 'v1.5.1', date: '2026-11-12T22:43:36Z', unreleased: 3 });
    const annotated = parseRepo({ pullRequests: { nodes: [] }, refs: { nodes: [{ name: 'v2.0.0', compare: null, target: { target: { committedDate: '2026-01-01T00:00:00Z' } } }] } });
    expect(annotated?.release).toEqual({ tag: 'v2.0.0', date: '2026-01-01T00:00:00Z', unreleased: null });
});

it('returns null for a repo GitHub could not find, and quotes repo names in the query', () => {
    expect(parseRepo(null)).toBeNull();
    expect(parseRepo({ pullRequests: 'surprise' })).toBeNull();
    expect(buildQuery([{ name: 'X', repo: 'a"b', site: 'x', project: 1 }])).toContain('name: "a\\"b"');
});
