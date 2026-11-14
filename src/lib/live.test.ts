import { expect, it } from 'vitest';
import type { RepoStatus } from './github';
import { lastDeploy, liveState } from './live';

const now = Date.parse('2026-11-13T22:00:00Z');
const repo = (over: Partial<NonNullable<RepoStatus>> = {}): RepoStatus => ({
    prs: [], release: null, releasesDeploy: false, checksPrs: true, deploysWorker: true, deployWorkflow: null, isPrivate: true, worker: 'w', versions: {},
    main: { sha: null, head: '2026-11-13T21:00:00Z', merges: ['2026-11-13T21:00:00Z', '2026-11-13T20:00:00Z', '2026-11-12T10:00:00Z'], checks: 'passing' }, ...over,
});

it('counts the merges since the last deploy, and calls a fresh one deploying', () => {
    expect(liveState(repo(), '2026-11-13T21:30:00Z', now)).toEqual({ state: 'live', since: '2026-11-13T21:30:00Z' });
    expect(liveState(repo(), '2026-11-13T19:00:00Z', now)).toMatchObject({ state: 'behind', label: '2 merges not live' });
    expect(liveState(repo(), '2026-11-13T19:00:00Z', Date.parse('2026-11-13T21:05:00Z'))).toMatchObject({ state: 'deploying' });
    // A direct push (no merge commit) still counts
    expect(liveState(repo({ main: { sha: null, head: '2026-11-13T21:00:00Z', merges: [], checks: 'passing' } }), '2026-11-13T19:00:00Z', now)).toMatchObject({ label: 'Main not live' });
});

it('judges a release-deployed repo by its latest release, not main', () => {
    const r = repo({ releasesDeploy: true, release: { tag: 'v1.5.2', date: '2026-11-13T20:00:00Z', unreleased: 0 } });
    expect(liveState(r, '2026-11-12T22:44:00Z', now)).toMatchObject({ state: 'behind', label: 'v1.5.2 not live' });
    expect(liveState(r, '2026-11-13T21:00:00Z', now)).toMatchObject({ state: 'live' });
});

it('knows nothing without the repo or a deploy time', () => {
    expect(liveState(undefined, '2026-11-13T21:00:00Z', now)).toBeNull();
    expect(liveState(repo(), undefined, now)).toBeNull();
});

it('takes the newest production deploy that succeeded', () => {
    const d = (createdAt: string, state: string | null) => ({ createdAt, latestStatus: state ? { state } : null });
    expect(lastDeploy([d('2026-11-13T21:00:00Z', 'FAILURE'), d('2026-11-13T20:00:00Z', null), d('2026-11-12T10:00:00Z', 'SUCCESS')])).toBe('2026-11-12T10:00:00Z');
    expect(lastDeploy([])).toBeUndefined();
});
