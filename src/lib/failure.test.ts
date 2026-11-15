import { expect, it } from 'vitest';
import { failureText, logTail, usefulNotes } from './failure';

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
