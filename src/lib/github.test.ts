import { expect, it } from 'vitest';
import { buildQuery, parseRepo, runsChecks, workerName } from './github';

const pr = (over: object = {}) => ({
    number: 12, title: 'Fix the thing', url: 'https://github.com/o/r/pull/12', isDraft: false, updatedAt: '2026-11-10T09:00:00Z',
    author: { login: 'dev' }, reviewDecision: 'REVIEW_REQUIRED',
    commits: { nodes: [{ commit: { oid: 'head1', statusCheckRollup: { state: 'FAILURE' } } }] }, ...over,
});

it('maps PR review and check states, the head commit, and a deleted author', () => {
    const repo = parseRepo({
        pullRequests: { nodes: [pr(), pr({ author: null, reviewDecision: null, commits: { nodes: [{ commit: { statusCheckRollup: null } }] } })] },
        refs: { nodes: [] },
    });
    expect(repo?.prs.map(p => [p.author, p.review, p.checks, p.sha])).toEqual([['dev', 'waiting', 'failing', 'head1'], ['ghost', 'none', 'none', null]]);
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

it('reads the Worker name from wrangler.jsonc, not a binding name', () => {
    expect(workerName('{\n\t// comment with "name": "nope"\n\t"$schema": "x",\n\t"name": "how-many",\n\t"main": "w.js",\n\t"send_email": [{ "name": "EMAIL" }]\n}')).toBe('how-many');
    expect(workerName(null)).toBeNull();
});

it('reads when main last moved, which of its commits are merges, and its checks', () => {
    const c = (committedDate: string, messageHeadline: string) => ({ committedDate, messageHeadline });
    const repo = parseRepo({ pullRequests: { nodes: [] }, refs: { nodes: [] }, main: { oid: 'abc', statusCheckRollup: { state: 'FAILURE' }, history: { nodes: [
        c('2026-11-13T21:00:00Z', 'Merge pull request #28 from owner/feat/x'),
        c('2026-11-13T20:00:00Z', "Merge branch 'main' into feat/x"), // the branch catching up: not a merged PR
        c('2026-11-13T19:00:00Z', 'Fix a thing'),
        c('2026-11-12T10:00:00Z', 'Merge pull request #27 from owner/feat/y'),
    ] } } });
    expect(repo?.main).toEqual({ sha: 'abc', head: '2026-11-13T21:00:00Z', merges: ['2026-11-13T21:00:00Z', '2026-11-12T10:00:00Z'], checks: 'failing' });
    expect(parseRepo({ pullRequests: { nodes: [] }, refs: { nodes: [] } })?.main).toEqual({ sha: null, head: null, merges: [], checks: 'none' });
});

it('reads from the workflows whether releases deploy, PRs get checks and Actions deploys a Worker', () => {
    const wf = (name: string, text: string) => ({ name, object: { text } });
    const read = (entries: ReturnType<typeof wf>[] | null) => {
        const r = parseRepo({ pullRequests: { nodes: [] }, refs: { nodes: [] }, workflows: entries && { entries } });
        return [r?.releasesDeploy, r?.checksPrs, r?.deploysWorker];
    };
    expect(read([
        wf('ci.yml', 'name: CI\non:\n  pull_request:\n    types: [opened]'),
        wf('deploy-workers.yml', 'jobs:\n  deploy:\n    steps:\n      - run: npx wrangler deploy'),
        wf('release.yml', 'on:\n  workflow_dispatch:'),
    ])).toEqual([true, true, true]);
    expect(read([wf('ci.yml', 'on: [push, pull_request]')])).toEqual([false, true, false]);
    // A push workflow that only reads the PR event is not a check on PRs
    expect(read([wf('x.yml', 'on:\n  push:\njobs:\n  a:\n    if: github.event.pull_request')])).toEqual([false, false, false]);
    expect(read(null)).toEqual([false, false, false]);
});

it("reads main's checks from its Actions runs: any failure fails, then anything still going is running", () => {
    const run = (status: string, conclusion: string | null) => ({ status, conclusion });
    expect(runsChecks([run('completed', 'success'), run('completed', 'failure')])).toBe('failing');
    expect(runsChecks([run('completed', 'success'), run('in_progress', null)])).toBe('running');
    expect(runsChecks([run('completed', 'success'), run('completed', 'skipped')])).toBe('passing');
    expect(runsChecks([])).toBe('none');
});
