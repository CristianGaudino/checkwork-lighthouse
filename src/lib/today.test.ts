import { expect, it } from 'vitest';
import type { PullRequest, RepoStatus } from './github';
import { ago, buildRows } from './today';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const p = (name: string) => ({ name, repo: name, site: `${name}.ie`, project: 1 });
const pr = (over: Partial<PullRequest> = {}): PullRequest => ({ number: 1, title: 't', url: 'u', draft: false, updatedAt: '2026-11-13T11:00:00Z', author: 'a', review: 'approved', checks: 'passing', ...over });
const repo = (prs: PullRequest[], unreleased = 0): RepoStatus => ({ prs, release: { tag: 'v1.0.0', date: null, unreleased } });

it('puts failing and missing repos first, then anything waiting, then quiet ones, keeping config order on ties', () => {
    const rows = buildRows(
        [p('quiet'), p('unreleased'), p('failing'), p('missing'), p('quiet2')],
        [repo([]), repo([], 3), repo([pr({ checks: 'failing' })]), null, repo([])],
        NOW,
    );
    expect(rows.map(r => r.name)).toEqual(['failing', 'missing', 'unreleased', 'quiet', 'quiet2']);
    expect(rows[0].reasons).toEqual(['1 PR failing checks']);
    expect(rows[2].reasons).toEqual(['3 commits not released']);
});

it('ignores drafts, and flags PRs to review and stale ones', () => {
    const [row] = buildRows([p('r')], [repo([pr({ draft: true, checks: 'failing' }), pr({ review: 'waiting', updatedAt: '2026-11-01T00:00:00Z' })])], NOW);
    expect(row.attention).toBe(2);
    expect(row.reasons).toEqual(['1 PR to review', '1 stale PR']);
});

it('says how long ago in plain words', () => {
    expect(ago('2026-11-13T11:59:30Z', NOW)).toBe('just now');
    expect(ago('2026-11-13T09:00:00Z', NOW)).toBe('3 hours ago');
    expect(ago('2026-11-12T12:00:00Z', NOW)).toBe('yesterday');
});
