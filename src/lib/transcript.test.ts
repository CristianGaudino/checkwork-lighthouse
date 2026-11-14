import { mkdtemp, appendFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { isSessionId, parseLines, readTranscript, toolSummary } from './transcript';

const j = (o: object) => JSON.stringify(o);
const msg = (n: number, type: 'user' | 'assistant', content: unknown, extra: object = {}) =>
    j({ type, uuid: `u${n}`, timestamp: `2026-11-14T10:00:${String(n % 60).padStart(2, '0')}Z`, message: { content }, ...extra });

it('turns transcript lines into the conversation, leaving out what the harness added', () => {
    const lines = [
        '{"cut off',
        msg(1, 'user', 'Fix the hero <system-reminder>noise</system-reminder>'),
        msg(2, 'user', 'reminder only', { isMeta: true }),
        msg(3, 'user', '<command-name>/clear</command-name>'),
        msg(4, 'assistant', [{ type: 'thinking', thinking: 'Hmm' }, { type: 'text', text: 'On it' }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test', description: 'Run tests' } }]),
        msg(5, 'user', [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'ok' }, { type: 'image' }], is_error: false }]),
        msg(6, 'assistant', [{ type: 'text', text: 'sub' }], { isSidechain: true }),
        j({ type: 'api-request-blob', body: '"type":"assistant"' }),
    ];
    expect(parseLines(lines).map(e => [e.kind, 'text' in e ? e.text : 'summary' in e ? e.summary : ''])).toEqual([
        ['you', 'Fix the hero'], ['thinking', 'Hmm'], ['claude', 'On it'], ['tool', 'Run tests'], ['result', 'ok\n[image]'],
    ]);
    expect(toolSummary('Read', { file_path: 'C:\\x.ts' })).toBe('C:\\x.ts');
    expect(toolSummary('AskUserQuestion', { questions: [{ question: 'A?' }, { question: 'B?' }] })).toBe('A? / B?');
    expect(isSessionId('ea020e4c-ce1c-4a0b-a968-dc1a9a88816e')).toBe(true);
    expect(isSessionId('../../etc/passwd')).toBe(false);
});

it('reads a big transcript backwards in pieces, then only what was added', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'lh-')), 's.jsonl');
    const filler = j({ type: 'api-request-blob', body: 'x'.repeat(3 * 1024 * 1024) }); // longer than one chunk
    const lines = Array.from({ length: 200 }, (_, i) => (i % 50 === 25 ? filler : msg(i, i % 2 ? 'assistant' : 'user', [{ type: 'text', text: `m${i}` }])));
    await writeFile(file, `${lines.join('\n')}\n`);
    const last = await readTranscript(file, {});
    const texts = (es: { kind: string }[]) => es.map(e => ('text' in e ? e.text : ''));
    expect(texts(last.entries).at(-1)).toBe('m199');
    expect(last.entries.length).toBeGreaterThanOrEqual(80);
    // Scrolling up joins on exactly, nothing lost or doubled
    const older = await readTranscript(file, { before: last.start });
    const all = [...texts(older.entries), ...texts(last.entries)];
    const more = older.start > 0 ? texts((await readTranscript(file, { before: older.start })).entries) : [];
    expect([...more, ...all]).toEqual(lines.flatMap((l, i) => (l === filler ? [] : [`m${i}`])));
    // Live: a half-written line waits until it's whole
    await appendFile(file, `${msg(200, 'assistant', [{ type: 'text', text: 'new' }])}\n{"type":"assistant","half`);
    const live = await readTranscript(file, { after: last.end });
    expect(texts(live.entries)).toEqual(['new']);
    expect((await readTranscript(file, { after: live.end })).entries).toEqual([]);
    expect(await readTranscript(file, { after: 10 ** 12 })).toMatchObject({ reset: true });
}, 60_000);

it('refuses requests from any page but this site’s own', async () => {
    const { fromElsewhere } = await import('../app/api/claude/guard');
    const me = 'http://localhost:3000';
    const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
    const json = { origin: me, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
    expect(fromElsewhere('POST', h(json), me)).toBeNull();
    expect(fromElsewhere('GET', h({ 'sec-fetch-site': 'same-origin' }), me)).toBeNull();
    // Another site's page: by what the browser says, by its origin, or as a plain form
    expect(fromElsewhere('GET', h({ 'sec-fetch-site': 'cross-site' }), me)).toBe(403);
    expect(fromElsewhere('POST', h({ ...json, 'sec-fetch-site': 'same-site' }), me)).toBe(403);
    expect(fromElsewhere('POST', h({ ...json, origin: 'https://evil.example' }), me)).toBe(403);
    expect(fromElsewhere('POST', h({ 'content-type': 'application/json' }), me)).toBe(403);
    expect(fromElsewhere('POST', h({ ...json, 'content-type': 'text/plain' }), me)).toBe(415);
});

it('gives a session Git Bash from the Git on PATH, and never an API key', async () => {
    const { findGitBash, sessionEnv } = await import('./runner');
    const w = String.raw;
    const bash = w`C:\Interpreter\Git\Git\bin\bash.exe`, standard = w`C:\Program Files\Git\bin\bash.exe`;
    const has = (f: string) => f === bash || f === standard;
    expect(findGitBash(w`C:\Windows;C:\Interpreter\Git\Git\mingw64\bin;C:\Interpreter\Git\Git\cmd`, has)).toBe(bash);
    expect(findGitBash(w`C:\Windows`, has)).toBe(standard);
    expect(findGitBash(w`C:\Windows`, () => false)).toBeNull();
    const env = sessionEnv({ Path: w`C:\Interpreter\Git\Git\cmd`, ANTHROPIC_API_KEY: 'sk', ANTHROPIC_AUTH_TOKEN: 't', HOME: 'h' }, has, true);
    expect(env).toMatchObject({ HOME: 'h', CLAUDE_CODE_GIT_BASH_PATH: bash });
    expect('ANTHROPIC_API_KEY' in env || 'ANTHROPIC_AUTH_TOKEN' in env).toBe(false);
    expect(sessionEnv({ CLAUDE_CODE_GIT_BASH_PATH: w`D:\bash.exe` }, has, true).CLAUDE_CODE_GIT_BASH_PATH).toBe(w`D:\bash.exe`);
});
