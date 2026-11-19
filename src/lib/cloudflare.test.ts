import { expect, it } from 'vitest';
import { summarise, summariseVisitors, workerTasks } from './cloudflare';

const host = (requestHost: string, count: number, visits: number, date = '2026-11-13') => ({ count, sum: { visits }, dimensions: { requestHost, date } });
const now = new Date('2026-11-13T12:00:00Z');
const path = (requestHost: string, requestPath: string, count: number) => ({ count, dimensions: { requestHost, requestPath } });
const worker = (scriptName: string, requests: number, errors: number, cpuTimeP99: number | null) => ({ sum: { requests, errors }, quantiles: { cpuTimeP99 }, dimensions: { scriptName } });

it('takes totals per site (www or not), keeps its top three paths, and merges Worker rows', () => {
    const a = summarise({ viewer: { accounts: [{
        hosts: [host('www.a.ie', 76, 46), host('a.ie', 10, 5, '2026-11-07'), host('b.ie', 3, 2), host('b.ie', 1, 1, '2026-11-01')],
        // b.ie has no path rows (crowded out), yet its totals still show; c.ie has paths but no totals, so it is skipped
        paths: [path('www.a.ie', '/', 50), path('a.ie', '/', 10), path('www.a.ie', '/x', 20), path('www.a.ie', '/y', 5), path('www.a.ie', '/z', 1), path('c.ie', '/', 9)],
        workers: [worker('a', 100, 2, 4500), worker('a', 50, 0, 9000), worker('b', 10, 0, null)],
    }] } }, now);
    expect(a.traffic.get('a.ie')).toEqual({ visits: 51, views: 86, days: [5, 0, 0, 0, 0, 0, 46], topPaths: [{ path: '/', views: 60 }, { path: '/x', views: 20 }, { path: '/y', views: 5 }] });
    // A row outside the 7 days (time zones at the edge) counts in the total but has no bar
    expect(a.traffic.get('b.ie')).toEqual({ visits: 3, views: 4, days: [0, 0, 0, 0, 0, 0, 2], topPaths: [] });
    expect(a.traffic.has('c.ie')).toBe(false);
    expect(a.workers.get('a')).toEqual({ requests: 150, errors: 2, cpuP99: 9 }); // microseconds in, milliseconds out
    expect(a.workers.get('b')).toEqual({ requests: 10, errors: 0, cpuP99: null });
});

it('copes with an account that has no data', () => {
    expect(summarise({ viewer: { accounts: [{}] } }).traffic.size).toBe(0);
    expect(summarise({ viewer: { accounts: [] } }).workers.size).toBe(0);
});

it('flags a Worker only past 1% errors and at least 10 of them', () => {
    const a = summarise({ viewer: { accounts: [{ workers: [worker('noisy', 1000, 25, 5), worker('fine', 1000, 9, 5), worker('rare', 100, 5, 5)] }] } });
    const tasks = workerTasks([{ name: 'N', worker: 'noisy' }, { name: 'F', worker: 'fine' }, { name: 'R', worker: 'rare' }, { name: 'X', worker: null }], a, 'acc');
    expect(tasks.map(t => [t.project, t.detail])).toEqual([['N', '2.5% of 1,000 requests failed in 24 hours']]);
    expect(tasks[0].href).toBe('https://dash.cloudflare.com/acc/workers/services/view/noisy/production/observability/logs');
});

it('takes last week per site and ranks where this week came from, leaving out clicks within the site', () => {
    const row = (requestHost: string, count: number, dims: Record<string, string | null>) => ({ count, dimensions: { requestHost, ...dims } });
    const v = summariseVisitors({ viewer: { accounts: [{
        prev: [{ count: 40, sum: { visits: 20 }, dimensions: { requestHost: 'www.a.ie' } }, { count: 5, sum: { visits: 3 }, dimensions: { requestHost: 'a.ie' } }],
        referrers: [row('www.a.ie', 30, { refererHost: 'www.a.ie' }), row('a.ie', 9, { refererHost: 'www.google.com' }), row('www.a.ie', 4, { refererHost: 'google.com' }), row('a.ie', 6, { refererHost: 'x.com' }), row('a.ie', 50, { refererHost: null })],
        countries: [row('a.ie', 7, { countryName: 'IE' }), row('a.ie', 2, { countryName: 'GB' })],
        devices: [row('b.ie', 3, { deviceType: 'mobile' })],
    }] } });
    expect(v.get('a.ie')).toEqual({
        prevVisits: 23, prevViews: 45,
        referrers: [{ name: 'google.com', views: 13 }, { name: 'x.com', views: 6 }],
        countries: [{ name: 'IE', views: 7 }, { name: 'GB', views: 2 }],
        devices: [],
    });
    // A site with nothing last week compares against 0
    expect(v.get('b.ie')).toEqual({ prevVisits: 0, prevViews: 0, referrers: [], countries: [], devices: [{ name: 'mobile', views: 3 }] });
    expect(summariseVisitors({ viewer: { accounts: [] } }).size).toBe(0);
});
