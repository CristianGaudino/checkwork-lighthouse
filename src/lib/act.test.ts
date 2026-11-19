import { afterEach, expect, it, vi } from 'vitest';
import { checkIssue, checkNumber, checkRepo, checkSha, checkStatus, rerunFailed, setStatus } from './act';

afterEach(() => vi.unstubAllGlobals());

it('only lets a listed repo, a known status, a positive whole PR number and a full commit id through', () => {
    const known = [{ repo: 'vintage' }];
    expect(checkRepo('vintage', known)).toBe('vintage');
    expect([checkRepo('someone-else', known), checkRepo('../vintage', known), checkRepo(null, known)]).toEqual([null, null, null]);
    expect(checkStatus('idle')).toBe('idle');
    expect([checkStatus('paused'), checkStatus('IDLE'), checkStatus(null)]).toEqual([null, null, null]);
    expect(checkNumber('12')).toBe(12);
    expect(checkSha('a'.repeat(40))).toBe('a'.repeat(40));
    expect([checkSha('abc'), checkSha('A'.repeat(40)), checkSha(`${'a'.repeat(40)}x`), checkSha(null)]).toEqual([null, null, null, null]);
    expect([checkNumber('0'), checkNumber('-3'), checkNumber('1.5'), checkNumber('12; drop'), checkNumber(null)]).toEqual([null, null, null, null, null]);
});

it('trims an issue, defaults an unknown type to Task, and refuses an empty or oversized one', () => {
    expect(checkIssue({ title: '  Fix the header  ', body: ' Steps ', type: 'Bug' })).toEqual({ title: 'Fix the header', body: 'Steps', type: 'Bug' });
    expect(checkIssue({ title: 'X', body: null, type: 'Epic' })).toEqual({ title: 'X', body: '', type: 'Task' });
    expect(checkIssue({ title: '   ', body: '', type: 'Bug' })).toBeNull();
    expect(checkIssue({ title: 'x'.repeat(257), body: '', type: 'Bug' })).toBeNull();
});

it('says a run waiting for approval has nothing to re-run, and re-runs nothing', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${url}`);
        return new Response(JSON.stringify({ workflow_runs: [{ id: 1, conclusion: 'action_required' }] }));
    });
    expect((await rerunFailed('t', 'vintage', 'a'.repeat(40))).error).toMatch(/waiting for approval/);
    expect(calls.filter(c => c.startsWith('POST'))).toEqual([]);
});

it('writes the topics back with only the lighthouse one swapped, and says which permission a 403 needs', async () => {
    const calls: { method?: string; url: string; body?: unknown }[] = [];
    let put = 200;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        calls.push({ method: init?.method, url, body: init?.body && JSON.parse(init.body as string) });
        return init?.method === 'GET'
            ? new Response(JSON.stringify({ topics: ['nextjs', 'lighthouse-idle'], pushed_at: new Date().toISOString(), archived: false }))
            : new Response('{}', { status: put });
    });
    expect((await setStatus('t', 'vintage', 'muted')).ok).toBe('Saved as muted');
    expect(calls[1]).toMatchObject({ method: 'PUT', url: expect.stringMatching(/\/vintage\/topics$/), body: { names: ['nextjs', 'lighthouse-muted'] } });
    put = 403;
    expect((await setStatus('t', 'vintage', 'active')).error).toMatch(/Administration: Read and write/);
    expect(calls[3].body).toEqual({ names: ['nextjs'] });
});
