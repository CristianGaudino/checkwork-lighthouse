import { expect, it } from 'vitest';
import type { RepoStatus } from './github';
import { setupChecks } from './setup';

const repo = (over: Partial<NonNullable<RepoStatus>> = {}): RepoStatus => ({
    prs: [], release: null, releasesDeploy: false, checksPrs: true, deploysWorker: true, isPrivate: true, worker: 'w', versions: {},
    main: { sha: null, head: null, merges: [], checks: 'none' }, ...over,
});
const traffic = { visits: 1, views: 1, days: [], topPaths: [] };
const done = (...a: Parameters<typeof setupChecks>) => setupChecks(...a).map(c => c.done);

it('checks monitor, Web Analytics, PR checks and deploys', () => {
    expect(done({ repo: repo(), uptime: { id: 1, state: 'up', seconds: 60 }, analytics: true, traffic, live: null })).toEqual([true, true, true, true]);
    expect(done({ repo: repo({ checksPrs: false, deploysWorker: false }), uptime: null, analytics: true, traffic: undefined, live: null })).toEqual([false, false, false, false]);
});

it('counts a site off Workers as deploying once GitHub has a deploy on record', () => {
    expect(done({ repo: repo({ worker: null }), uptime: null, analytics: true, traffic, live: { state: 'live', since: 'x' } })[3]).toBe(true);
    expect(done({ repo: repo({ worker: null }), uptime: null, analytics: true, traffic, live: null })[3]).toBe(false);
});

it('says not known where a source did not answer, rather than missing', () => {
    expect(done({ repo: undefined, uptime: undefined, analytics: false, traffic: undefined, live: null })).toEqual([null, null, null, null]);
});
