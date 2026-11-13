import { expect, it } from 'vitest';
import type { PullRequest, RepoStatus } from './github';
import { ago, buildBoard } from './today';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const p = (name: string) => ({ name, repo: name, site: `${name}.ie`, project: 1 });
const pr = (over: Partial<PullRequest> = {}): PullRequest => ({ number: 1, title: 't', url: 'u', draft: false, updatedAt: '2026-11-13T11:00:00Z', author: 'a', review: 'none', checks: 'passing', ...over });
const repo = (prs: PullRequest[], unreleased = 0): RepoStatus => ({ prs, release: { tag: 'v1.0.0', date: '2026-11-10T12:00:00Z', unreleased } });

it('queues the worst first, keeps config order on ties, and lights each project', () => {
    const { tasks, projects } = buildBoard(
        [p('quiet'), p('unreleased'), p('failing'), p('missing')],
        [repo([]), repo([], 3), repo([pr({ checks: 'failing' })]), null],
        NOW,
    );
    expect(tasks.map(t => [t.project, t.action])).toEqual([['failing', 'Fix checks on'], ['missing', 'Check access to'], ['unreleased', 'Release 3 commits']]);
    expect(tasks[2]).toMatchObject({ detail: 'On main since v1.0.0, 3 days ago', href: 'https://github.com/CristianGaudino/unreleased/compare/v1.0.0...main' });
    expect(projects.map(x => x.light)).toEqual(['ok', 'warn', 'bad', 'bad']);
});

it('words each PR as the next step, skips drafts, and says when one has gone quiet', () => {
    const { tasks } = buildBoard([p('r')], [repo([
        pr({ draft: true, checks: 'failing' }),
        pr({ number: 2, review: 'approved' }),
        pr({ number: 3, review: 'approved', checks: 'running' }),
        pr({ number: 4, review: 'changes' }),
        pr({ number: 5, updatedAt: '2026-11-01T00:00:00Z' }),
    ])], NOW);
    expect(tasks.map(t => `${t.action} ${t.title}`)).toEqual(['Merge #2 t', 'Review #3 t', 'Update #4 t', 'Review #5 t']);
    expect(tasks[3].detail).toBe('a, updated 12 days ago, gone quiet, checks pass');
});

it('says how long ago in plain words', () => {
    expect(ago('2026-11-13T11:59:30Z', NOW)).toBe('just now');
    expect(ago('2026-11-13T09:00:00Z', NOW)).toBe('3 hours ago');
    expect(ago('2026-11-12T12:00:00Z', NOW)).toBe('yesterday');
});
