import { afterEach, expect, it, vi } from 'vitest';
import { failureText, fetchFailure, logTail, usefulNotes } from './failure';

afterEach(() => vi.unstubAllGlobals());

it('keeps the log up to the last error, without timestamps, colours or groups', () => {
    const log = [
        '2026-11-15T10:00:00.0000000Z ##[group]Run npm test',
        '2026-11-15T10:00:01.0000000Z \x1b[31mFAIL\x1b[0m src/a.test.ts',
        '2026-11-15T10:00:01.1000000Z expected 2 to be 3',
        '2026-11-15T10:00:02.0000000Z ##[endgroup]',
        '2026-11-15T10:00:03.0000000Z ##[error]Process completed with exit code 1.',
        '2026-11-15T10:00:04.0000000Z Post job cleanup.',
        '',
    ].join('\r\n');
    expect(logTail(log)).toEqual(['FAIL src/a.test.ts', 'expected 2 to be 3', 'Error: Process completed with exit code 1.']);
    expect(logTail(log, 1)).toEqual(['Error: Process completed with exit code 1.']);
    expect(logTail('one\ntwo')).toEqual(['one', 'two']);
});

it('drops GitHub\'s generic exit-code note and notices, and says where an error is', () => {
    expect(usefulNotes([
        { message: 'Process completed with exit code 1.', annotation_level: 'failure', path: '.github', start_line: 1 },
        { message: 'Cache restored', annotation_level: 'notice', path: null, start_line: null },
        { message: "Type 'string' is not assignable", annotation_level: 'failure', path: 'src/a.ts', start_line: 12 },
    ])).toEqual(["src/a.ts:12: Type 'string' is not assignable"]);
});

it('words the failure for Claude, short enough for a link', () => {
    const text = failureText({ workflow: 'CI', job: 'test', step: 'Run npm test', href: 'h', notes: ['n'], log: Array.from({ length: 200 }, () => 'x'.repeat(50)) });
    expect(text.startsWith('It failed in CI, job test, step Run npm test.\nn\nEnd of the log:\n')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(1500);
});

it('picks the first failed run, its first failed job and step, and follows the log redirect without the token', async () => {
    const asked: { url: string; auth: boolean }[] = [];
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        asked.push({ url, auth: Boolean((init?.headers as Record<string, string> | undefined)?.authorization) });
        if (url.includes('/actions/runs?')) return json({ workflow_runs: [{ id: 1, name: 'CI', conclusion: 'success' }, { id: 2, name: 'Deploy', conclusion: 'failure' }] });
        if (url.includes('/runs/2/jobs')) return json({ jobs: [
            { id: 10, name: 'lint', conclusion: 'success', html_url: 'j10', steps: [] },
            { id: 11, name: 'build', conclusion: 'failure', html_url: 'j11', steps: [{ name: 'Setup', conclusion: 'success' }, { name: 'npm test', conclusion: 'failure' }] },
        ] });
        if (url.includes('/check-runs/11/annotations')) return json([{ message: 'boom', annotation_level: 'failure', path: 'a.ts', start_line: 3 }]);
        if (url.includes('/jobs/11/logs')) return new Response(null, { status: 302, headers: { location: 'https://logs.example/11' } });
        if (url === 'https://logs.example/11') return new Response('x\n##[error]it broke\nPost job cleanup.');
        throw new Error(`unexpected ${url}`);
    });
    expect(await fetchFailure('t', 'r', 'sha')).toEqual({ workflow: 'Deploy', job: 'build', step: 'npm test', href: 'j11', notes: ['a.ts:3: boom'], log: ['x', 'Error: it broke'] });
    expect(asked.find(a => a.url.startsWith('https://logs.example'))?.auth).toBe(false);
});

it('says nothing failed when no run did', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ workflow_runs: [{ id: 1, name: 'CI', conclusion: 'success' }] })));
    expect(await fetchFailure('t', 'r', 'sha')).toBeNull();
});
