import { expect, it } from 'vitest';
import { mergeProjects, siteOf, statusOf, swapTopic, type Owned } from './repos';

const now = Date.parse('2026-11-19T00:00:00Z');
const repo = (name: string, o: Partial<Owned> = {}): Owned => ({ name, isArchived: false, pushedAt: '2026-11-01T00:00:00Z', topics: [], ...o });

it('reads the status from the topic, GitHub archived first, and an untouched repo of over a year as archived', () => {
    expect(statusOf(repo('a'), now)).toBe('active');
    expect(statusOf(repo('a', { topics: ['nextjs', 'lighthouse-idle'] }), now)).toBe('idle');
    expect(statusOf(repo('a', { topics: ['lighthouse-muted'] }), now)).toBe('muted');
    expect(statusOf(repo('a', { isArchived: true, topics: ['lighthouse-idle'] }), now)).toBe('archived');
    expect(statusOf(repo('a', { pushedAt: '2025-11-01T00:00:00Z' }), now)).toBe('archived');
    // Set active on an old repo: its topic keeps it active
    expect(statusOf(repo('a', { pushedAt: '2025-11-01T00:00:00Z', topics: ['lighthouse-active'] }), now)).toBe('active');
});

it('never ages a config line into archived: a live site nobody touches keeps its alerts', () => {
    const [p] = mergeProjects([{ name: 'Portfolio', repo: 'portfolio', site: 'www.cgaudino.com' }], [repo('portfolio', { pushedAt: '2024-01-01T00:00:00Z' })], now);
    expect(p.status).toBe('active');
});

it('swaps only the lighthouse topic, and writes active only where the repo is too old to go without', () => {
    expect(swapTopic(['nextjs', 'lighthouse-idle'], 'muted', false)).toEqual(['nextjs', 'lighthouse-muted']);
    expect(swapTopic(['nextjs', 'lighthouse-idle'], 'active', false)).toEqual(['nextjs']);
    expect(swapTopic(['nextjs'], 'active', true)).toEqual(['nextjs', 'lighthouse-active']);
});

it('keeps config lines first and winning, adds the other repos by their name and homepage, and sorts quiet ones lower', () => {
    const config = [{ name: 'How Many?', repo: 'vintage', site: 'www.checkhowmany.com', project: 3 }, { name: 'Gone', repo: 'gone', site: 'gone.ie' }];
    const listed = mergeProjects(config, [
        repo('Vintage', { topics: ['lighthouse-idle'] }),
        repo('tools', { site: 'tools.example.com' }),
        repo('old', { pushedAt: '2024-01-01T00:00:00Z' }),
    ], now);
    expect(listed).toEqual([
        { name: 'Gone', repo: 'gone', site: 'gone.ie', status: 'active' },
        { name: 'tools', repo: 'tools', site: 'tools.example.com', status: 'active' },
        { name: 'How Many?', repo: 'vintage', site: 'www.checkhowmany.com', project: 3, status: 'idle' },
        { name: 'old', repo: 'old', site: undefined, status: 'archived' },
    ]);
});

it('writes a homepage the way config writes a site', () => {
    expect(siteOf('https://www.example.com/')).toBe('www.example.com');
    expect(siteOf('http://example.com')).toBe('example.com');
    expect([siteOf(''), siteOf(null)]).toEqual([undefined, undefined]);
});
