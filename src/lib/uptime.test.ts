import { expect, it } from 'vitest';
import { matchUptime } from './uptime';

const p = (site: string) => ({ name: site, repo: site, site, project: 1 });

it('matches monitors by address with or without www, keeps only safe fields, and skips odd ones', () => {
    const got = matchUptime([p('www.a.ie'), p('b.ie'), p('www.none.ie'), p('www.c.ie')], [
        { id: 1, url: 'https://a.ie', status: 'UP', currentStateDuration: 90, httpPassword: 'secret', apiKey: 'k' },
        { id: 2, url: 'https://www.b.ie/', status: 'DOWN', currentStateDuration: null },
        { id: 3, url: 'https://www.c.ie', status: 'STARTED' },
        { id: 'bad' },
    ]);
    expect(got).toEqual([
        { id: 1, state: 'up', seconds: 90 },
        { id: 2, state: 'down', seconds: null },
        null,
        { id: 3, state: 'unknown', seconds: null },
    ]);
});
