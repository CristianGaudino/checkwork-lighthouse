import { expect, it } from 'vitest';
import { askHref, parseTail, resumeHref } from './claude';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const j = (o: object) => JSON.stringify(o);
const line = (type: string, content: unknown, at = '2026-11-13T11:00:00Z') => j({ type, timestamp: at, cwd: 'c:\\Git\\vintage', message: { role: type, content } });

it('reads the title, repo and PR, and says the session is waiting when Claude ended on text', () => {
    const text = ['{"cut off mid-li', j({ type: 'ai-title', aiTitle: 'Fix the  stock\npage' }), j({ type: 'pr-link', prUrl: 'https://github.com/o/vintage/pull/9' }),
        line('user', 'go'), line('assistant', [{ type: 'text', text: 'Done' }])].join('\n');
    expect(parseTail(text, 's1', NOW)).toEqual({ id: 's1', repo: 'vintage', title: 'Fix the stock page', state: 'waiting', at: '2026-11-13T11:00:00Z', prUrl: 'https://github.com/o/vintage/pull/9' });
});

it('tells working from stopped by how fresh the last tool step is, and falls back to the last prompt for a title', () => {
    const mid = (at: string) => [j({ type: 'last-prompt', lastPrompt: 'Ship it' }), line('assistant', [{ type: 'tool_use' }], at)].join('\n');
    expect(parseTail(mid('2026-11-13T11:59:30Z'), 's', NOW)).toMatchObject({ state: 'working', title: 'Ship it' });
    expect(parseTail(mid('2026-11-13T10:00:00Z'), 's', NOW)).toMatchObject({ state: 'stopped' });
    expect(parseTail(line('user', [{ type: 'tool_result' }], '2026-11-13T10:00:00Z'), 's', NOW)).toMatchObject({ state: 'stopped', title: 'Untitled session' });
    expect(parseTail(j({ type: 'summary' }), 's', NOW)).toBeNull();
});

it('builds the Claude Code extension links', () => {
    expect(resumeHref('a5f7')).toBe('vscode://anthropic.claude-code/open?session=a5f7');
    expect(askHref('Review https://x/pull/1 & say')).toBe('vscode://anthropic.claude-code/open?prompt=Review+https%3A%2F%2Fx%2Fpull%2F1+%26+say');
});
