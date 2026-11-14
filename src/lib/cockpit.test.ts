import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildActivity } from './activity';
import { checkBatch, checkWorkflow, mergeAll, rerunFailed } from './act';
import { needsYou } from './claude';
import { dollars, monthStart, plans } from './costs';
import { iconHrefs, iconsByRepo, initials, subLetter } from './icons';
import { matchServers } from './local';
import { jumps, matches } from './palette';
import { beats } from './pulse';
import { FORGET_MS, freshKeys } from './seen';
import type { Task } from './today';

const p = (repo: string, name = repo) => ({ name, repo, site: `www.${repo}.ie`, project: 1 });
const NOW = Date.parse('2026-11-13T12:00:00Z');

it('finds a page’s icons, SVG then the largest, with /favicon.ico last', () => {
    const html = `<link rel="icon" href="/a-16.png" sizes="16x16"><link rel='apple-touch-icon' href='/touch.png' sizes='180x180'>
        <link href="/i.svg" rel="icon" type="image/svg+xml"><link rel="stylesheet" href="/x.css"><link rel="icon"><link data-rel="icon" rel="preload" href="/no.png">`;
    expect(iconHrefs(html, 'https://www.a.ie/')).toEqual(['https://www.a.ie/i.svg', 'https://www.a.ie/touch.png', 'https://www.a.ie/a-16.png', 'https://www.a.ie/favicon.ico']);
    expect(iconHrefs('', 'https://b.ie/')).toEqual(['https://b.ie/favicon.ico']);
});

it('gives a shared favicon to the first project only, and makes initials', () => {
    expect(iconsByRepo([p('a'), p('b'), p('c')], ['data:x', 'data:x', null])).toEqual({ a: 'data:x' });
    expect([initials('How Many?'), initials('Checkwork demo'), initials('Portfolio')]).toEqual(['HM', 'CD', 'P']);
    expect([subLetter('www.demo.checkwork.ie'), subLetter('www.checkwork.ie'), subLetter('checkhowmany.com')]).toEqual(['D', null, null]);
});

it('counts what needs you, keyed so a change notifies once', () => {
    const tasks: Task[] = [
        { project: 'A', level: 1, action: 'Site down:', title: 'a.ie', detail: 'Down', href: 'h', incidentRepo: 'a' },
        { project: 'A', level: 2, action: 'Merge', title: '#3 x', detail: 'd', href: 'h', pr: { repo: 'a', number: 3, sha: 'abc', mine: true, canMerge: true } },
        { project: 'A', level: 1, action: 'Fix main', detail: 'd', href: 'h' },
    ];
    const s = { id: 's', repo: 'a', title: 't', state: 'question' as const, at: 'z', prUrl: null, questions: [{ text: 'Go?', options: [] }] };
    const got = beats(tasks, [s, { ...s, id: 'w', state: 'working' }]);
    expect(got.map(b => b.kind)).toEqual(['down', 'pr', 'main', 'claude']);
    expect(got[1]).toMatchObject({ key: 'A Merge #3 x abc', title: 'Ready to merge: #3 x' });
    expect(got[3]).toMatchObject({ key: 'claude s question z', body: 'Go?', href: '/claude/s' });
});

it('lists every place a project lives, and matches typed words in any order', () => {
    const sites = [{ p: { ...p('vintage', 'How Many?'), uptime: { id: 7 }, repoStatus: { prs: [{ number: 2, title: 'Fix', url: 'u' } as never] } }, worker: 'vw' }];
    const all = jumps(sites, { account: 'acc', neon: [{ id: 'n1', name: 'Vintage' }], root: 'C:\\Git' });
    const hrefs = all.map(j => j.href);
    expect(hrefs).toContain('https://dash.cloudflare.com/acc/workers/services/view/vw/production');
    expect(hrefs).toContain('https://console.neon.tech/app/projects/n1');
    expect(hrefs).toContain('https://dashboard.uptimerobot.com/monitors/7');
    expect(hrefs).toContain('vscode://file/C:/Git/vintage');
    expect(hrefs).toContain('/pc');
    expect(all.filter(j => matches(j, 'actions many')).map(j => j.href)).toEqual(['https://github.com/CristianGaudino/vintage/actions']);
    expect(jumps(sites, {}).map(j => j.href)).not.toContain('/pc');
});

it('builds the week’s activity newest first, without Dependabot’s new PRs', () => {
    const history = [{
        merged: { nodes: [{ number: 1, title: 'A', url: 'm', mergedAt: '2026-11-13T10:00:00Z', author: { login: 'CristianGaudino' } }] },
        opened: { nodes: [{ number: 2, title: 'Bump', url: 'o', createdAt: '2026-11-13T11:00:00Z', author: { login: 'dependabot' } }, { number: 3, title: 'B', url: 'o3', createdAt: '2026-11-12T11:00:00Z', author: { login: 'dev2' } }] },
        issues: { nodes: [{ number: 4, title: 'Old', url: 'i', createdAt: '2026-10-01T00:00:00Z', author: null }] },
        releases: { nodes: [] },
    }];
    const failed = [[{ name: 'CI', head_branch: 'main', html_url: 'f', created_at: '2026-11-13T11:30:00Z', conclusion: 'failure' }]];
    const sites = [{ p: { ...p('a'), uptime: { id: 9, state: 'up' as const, seconds: 600 } }, live: { state: 'live' as const, since: '2026-11-13T10:05:00Z' } }];
    expect(buildActivity(sites, history, failed, NOW).map(e => e.text)).toEqual(['a.ie came back up', 'CI failed on main', 'Deployed', 'Merged #1 A', 'Opened #3 B by dev2']);
});

it('reads costs: cents to dollars, yearly plans per month, the month’s start', () => {
    expect(dollars([{ amount: '1234.5' }, { amount: 'x' }])).toBe(12.345);
    expect(plans({ result: [{ price: 5, currency: 'USD', frequency: 'monthly', rate_plan: { public_name: 'Workers Paid' } }, { price: 120, frequency: 'yearly' }, { price: 0 }] }))
        .toEqual([{ name: 'Workers Paid', perMonth: 5, currency: 'USD' }, { name: 'Subscription', perMonth: 10, currency: 'USD' }]);
    expect(monthStart(new Date('2026-11-13T12:00:00Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
});

it('checks a batch and a workflow from the form', () => {
    const sha = 'a'.repeat(40);
    expect(checkBatch(`3:${sha},4:${sha}`)).toEqual([{ number: 3, sha }, { number: 4, sha }]);
    expect(checkBatch(`3:${sha},4:nope`)).toBeNull();
    expect(checkBatch('')).toBeNull();
    expect(checkWorkflow('deploy.yml')).toBe('deploy.yml');
    expect(checkWorkflow('../x.yml')).toBeNull();
});

it('ties each listening port to its repo through the process tree, lowest port first', () => {
    const procs = [
        { ProcessId: 1, ParentProcessId: 0, CommandLine: 'node C:\\Git\\vintage\\node_modules\\next\\dist\\bin\\next dev' },
        { ProcessId: 2, ParentProcessId: 1, CommandLine: 'node start-server.js' },
        { ProcessId: 3, ParentProcessId: 0, CommandLine: 'node c:/git/how-much/node_modules/.bin/next dev' },
    ];
    const listening = [{ LocalPort: 3001, OwningProcess: 2 }, { LocalPort: 3000, OwningProcess: 3 }, { LocalPort: 9229, OwningProcess: 2 }, { LocalPort: 80, OwningProcess: 99 }];
    expect(matchServers('C:\\Git', ['vintage', 'how-much', 'vintage-old'], listening, procs)).toEqual([{ repo: 'how-much', port: 3000 }, { repo: 'vintage', port: 3001 }]);
});

it('counts a finished or stuck session as needing you for twelve hours, a question until it is answered', () => {
    const s = (state: 'question' | 'waiting' | 'blocked' | 'working', at: string) => ({ id: 'x', repo: 'a', title: 't', state, at, prUrl: null, questions: [] });
    expect(needsYou(s('waiting', '2026-11-13T01:00:00Z'), NOW)).toBe(true);
    expect(needsYou(s('waiting', '2026-11-12T23:00:00Z'), NOW)).toBe(false);
    expect(needsYou(s('blocked', '2026-11-12T23:00:00Z'), NOW)).toBe(false);
    // A three-minute build isn't you; ten minutes on one step most likely is a permission prompt
    expect(needsYou(s('blocked', '2026-11-13T11:57:00Z'), NOW)).toBe(false);
    expect(needsYou(s('blocked', '2026-11-13T11:50:00Z'), NOW)).toBe(true);
    expect(needsYou(s('question', '2026-11-12T00:00:00Z'), NOW)).toBe(true);
    expect(needsYou(s('working', '2026-11-13T11:59:00Z'), NOW)).toBe(false);
});

describe('writes to GitHub', () => {
    const calls: string[] = [];
    const answer = (status: number, body: object = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });
    afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; });
    const stub = (reply: (method: string, url: string) => Response) =>
        vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push(`${init?.method} ${url.replace('https://api.github.com/repos/CristianGaudino/', '')}`); return reply(init?.method ?? 'GET', url); }));

    it('re-runs only the runs that failed the checks, not cancelled ones', async () => {
        stub((method, url) => method === 'GET'
            ? answer(200, { workflow_runs: [{ id: 1, conclusion: 'failure' }, { id: 2, conclusion: 'cancelled' }, { id: 3, conclusion: 'success' }] })
            : url.includes('/runs/1/') ? answer(201) : answer(500));
        expect(await rerunFailed('t', 'vintage', 'a'.repeat(40))).toMatchObject({ ok: 'Running it again' });
        expect(calls.filter(c => c.startsWith('POST'))).toEqual(['POST vintage/actions/runs/1/rerun-failed-jobs']);
    });

    it('merges what it can of a batch and names the rest', async () => {
        stub((_m, url) => (url.includes('/pulls/4/') ? answer(409, { message: 'Head branch was modified' }) : answer(200)));
        expect(await mergeAll('t', 'vintage', [{ number: 3, sha: 'a' }, { number: 4, sha: 'b' }, { number: 5, sha: 'c' }]))
            .toEqual({ ok: 'Merged #3, #5. #4 not merged, open it to see why' });
        // No answer for one of them: the rest still go, and the result says which went in
        vi.stubGlobal('fetch', vi.fn(async (url: string) => { if (url.includes('/pulls/4/')) throw new Error('timeout'); return answer(200); }));
        expect(await mergeAll('t', 'vintage', [{ number: 3, sha: 'a' }, { number: 4, sha: 'b' }])).toEqual({ ok: 'Merged #3. #4 not merged, open it to see why' });
        stub(() => answer(405));
        expect(await mergeAll('t', 'vintage', [{ number: 3, sha: 'a' }])).toEqual({ error: 'GitHub merged none of #3. Open them to see why.' });
    });
});

it('notifies a key once, and not again when it drops out for a refresh or two', () => {
    const t0 = Date.parse('2026-11-13T12:00:00Z'), min = 60_000;
    const a = freshKeys(['main', 'pr'], null, t0);
    expect(a).toMatchObject({ fresh: ['main', 'pr'], first: true });
    // GitHub failed: the PR is gone for a minute, then back; only the new site-down is fresh
    const b = freshKeys(['main'], a.store, t0 + min);
    const c = freshKeys(['main', 'pr', 'down'], b.store, t0 + 2 * min);
    expect(c).toMatchObject({ fresh: ['down'], first: false });
    // Gone for longer than FORGET_MS: it is news again
    expect(freshKeys(['pr'], freshKeys([], c.store, t0 + 3 * min).store, t0 + 3 * min + FORGET_MS).fresh).toEqual(['pr']);
    expect(freshKeys(['x'], '["old","list"]', t0)).toMatchObject({ first: true });
});
