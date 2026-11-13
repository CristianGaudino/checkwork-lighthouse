import { expect, it } from 'vitest';
import type { PullRequest, RepoStatus } from './github';
import { ago, buildBoard, span } from './today';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const p = (name: string) => ({ name, repo: name, site: `${name}.ie`, project: 1 });
const pr = (over: Partial<PullRequest> = {}): PullRequest => ({ number: 1, title: 't', url: 'u', draft: false, updatedAt: '2026-11-13T11:00:00Z', author: 'a', review: 'none', checks: 'passing', ...over });
const repo = (prs: PullRequest[], unreleased = 0): RepoStatus => ({ prs, release: { tag: 'v1.0.0', date: '2026-11-10T12:00:00Z', unreleased }, releasesDeploy: true, isPrivate: true, worker: null, versions: {} });

it('queues the worst first, keeps config order on ties, and lights each project', () => {
    const { tasks, projects } = buildBoard(
        [p('quiet'), p('unreleased'), p('failing'), p('missing')],
        [repo([]), repo([], 3), repo([pr({ checks: 'failing' })]), null],
        undefined, NOW,
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
    ])], undefined, NOW);
    expect(tasks.map(t => `${t.action} ${t.title}`)).toEqual(['Merge #2 t', 'Review #3 t', 'Update #4 t', 'Review #5 t']);
    expect(tasks[3].detail).toBe('From a, updated 12 days ago, gone quiet, checks pass');
});

it('says how long ago in plain words', () => {
    expect(ago('2026-11-13T11:59:30Z', NOW)).toBe('just now');
    expect(ago('2026-11-13T09:00:00Z', NOW)).toBe('3 hours ago');
    expect(ago('2026-11-12T12:00:00Z', NOW)).toBe('yesterday');
});

it('turns uptime into tasks: down first, then a missing or paused monitor; nothing when UptimeRobot was not read', () => {
    const projects = [p('up'), p('down'), p('none'), p('paused')];
    const repos = [repo([]), repo([]), repo([]), repo([])];
    const { tasks, projects: states } = buildBoard(projects, repos, [
        { id: 1, state: 'up', seconds: 9 }, { id: 2, state: 'down', seconds: 300 }, null, { id: 4, state: 'paused', seconds: null },
    ], NOW);
    expect(tasks.map(t => `${t.action} ${t.title}: ${t.detail}`)).toEqual([
        'Site down: down.ie: Down for 5 minutes',
        'Add a monitor for none.ie: UptimeRobot is not watching it',
        'Resume monitoring for paused.ie: The UptimeRobot monitor is paused',
    ]);
    expect(tasks[0].href).toBe('https://dashboard.uptimerobot.com/monitors/2');
    expect(tasks.map(t => t.incidentRepo)).toEqual(['down', undefined, undefined]);
    expect(states.map(s => s.light)).toEqual(['ok', 'bad', 'warn', 'warn']);
    expect(buildBoard(projects, repos, undefined, NOW).tasks).toEqual([]);
    // GitHub unreadable too: no "check access" task for every repo
    expect(buildBoard(projects, undefined, undefined, NOW).tasks).toEqual([]);
});

it('says durations in whole units', () => {
    expect([span(20), span(60), span(7_200), span(3 * 86_400 + 5)]).toEqual(['1 minute', '1 minute', '2 hours', '3 days']);
});

it('asks for a release only where releases deploy', () => {
    const merges = { ...repo([], 2)!, releasesDeploy: false };
    expect(buildBoard([p('merges'), p('tags')], [merges, repo([], 2)], undefined, NOW).tasks.map(t => t.project)).toEqual(['tags']);
});

it('folds Dependabot PRs into one task per repo, and names who opened a PR unless it is the owner', () => {
    const { tasks } = buildBoard([p('r')], [repo([
        pr({ number: 1, author: 'dependabot' }), pr({ number: 2, author: 'dependabot', checks: 'failing' }), pr({ number: 3, author: 'dependabot', draft: true }),
        pr({ number: 4, author: 'CristianGaudino' }),
    ])], undefined, NOW);
    expect(tasks.map(t => [t.action, t.detail, t.level])).toEqual([
        ['Review 2 Dependabot updates', '1 with failing checks', 1],
        ['Review', 'Updated 1 hour ago, checks pass', 2],
    ]);
    expect(tasks[0].href).toBe('https://github.com/CristianGaudino/r/pulls/app%2Fdependabot');
});

it('marks PR tasks with what the page needs to merge or approve them', () => {
    const { tasks } = buildBoard([p('r')], [repo([pr({ number: 7, author: 'CristianGaudino' }), pr({ number: 8, author: 'other', checks: 'failing' }), pr({ number: 9, review: 'changes' })])], undefined, NOW);
    expect(tasks.map(t => t.pr)).toEqual([
        { repo: 'r', number: 8, mine: false, canMerge: false },
        { repo: 'r', number: 7, mine: true, canMerge: true },
        { repo: 'r', number: 9, mine: false, canMerge: false }, // changes asked for: no merge
    ]);
});
