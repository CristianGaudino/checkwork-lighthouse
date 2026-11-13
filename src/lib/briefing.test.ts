import { expect, it } from 'vitest';
import { briefPrompt, incidentPrompt, parseHistory } from './briefing';

it('puts only facts in the brief, splitting the owner from other authors and saying "nothing" when empty', () => {
    const text = briefPrompt({
        now: new Date('2026-11-14T08:00:00Z'),
        tasks: [{ project: 'Carright', level: 1, action: 'Site down:', title: 'carright.checkwork.ie', detail: 'Down for 5 minutes', href: 'x' }],
        merged: [{ repo: 'vintage', title: 'Fix stock', author: 'CristianGaudino', mergedAt: 'x' }, { repo: 'checkwork', title: 'New page', author: 'otherdev', mergedAt: 'x' }],
        minutes: { used: 1985, projected: 4682 },
    });
    expect(text).toContain('morning brief for 2026-11-14');
    expect(text).toContain('- Carright: Site down: carright.checkwork.ie (Down for 5 minutes)');
    expect(text).toContain('by me (or Claude working as me):\n- vintage: Fix stock');
    expect(text).toContain('by others:\n- checkwork: New page (by otherdev)');
    expect(text).toContain('Board, in progress:\n- unknown');
    expect(text).toContain('1985 of 2,000 used');
});

it('lists commits and runs for an incident, newest first as given', () => {
    const text = incidentPrompt({
        project: 'Carright', site: 'carright.checkwork.ie', down: 'down for 5 minutes',
        commits: [{ message: 'Move domain', date: '2026-11-13', author: 'Cristian' }],
        runs: [{ name: 'Deploy', conclusion: 'failure', status: 'completed', createdAt: '2026-11-13', sha: 'abc1234' }],
    });
    expect(text).toContain('- 2026-11-13 Cristian: Move domain');
    expect(text).toContain('- 2026-11-13 Deploy: failure at abc1234');
    expect(text).toContain('unknown (no Cloudflare analytics)');
});

it('reads main\'s history in the shape GitHub returns it, and an empty list for a missing branch', () => {
    // Trimmed from a live response for vintage
    const live = { repository: { ref: { target: { history: { nodes: [
        { messageHeadline: 'Merge pull request #490 from CristianGaudino/fix/refund-totals-race', committedDate: '2026-11-12T22:43:36Z', author: { name: 'CristianGaudino' } },
        { messageHeadline: 'No author', committedDate: '2026-11-12T22:43:20Z', author: null },
    ] } } } } };
    expect(parseHistory(live)).toEqual([
        { message: 'Merge pull request #490 from CristianGaudino/fix/refund-totals-race', date: '2026-11-12T22:43:36Z', author: 'CristianGaudino' },
        { message: 'No author', date: '2026-11-12T22:43:20Z', author: '?' },
    ]);
    expect(parseHistory({ repository: { ref: null } })).toEqual([]);
    expect(parseHistory({ repository: null })).toEqual([]);
    expect(parseHistory(undefined)).toEqual([]);
});
