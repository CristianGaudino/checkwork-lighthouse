import { afterEach, expect, it, vi } from 'vitest';
import { checkIssue, checkNumber, checkRepo, checkSha, rerunFailed } from './act';

afterEach(() => vi.unstubAllGlobals());

it('only lets a configured repo, a positive whole PR number and a full commit id through', () => {
    expect(checkRepo('vintage')).toBe('vintage');
    expect([checkRepo('someone-else'), checkRepo('../vintage'), checkRepo(null)]).toEqual([null, null, null]);
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
