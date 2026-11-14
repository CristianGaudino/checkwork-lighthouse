import { expect, it } from 'vitest';
import { askHref, parseTail, resumeHref, tokensSince } from './claude';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const j = (o: object) => JSON.stringify(o);
const line = (type: string, content: unknown, at = '2026-11-13T11:00:00Z') => j({ type, timestamp: at, cwd: 'c:\\Git\\vintage', message: { role: type, content } });

it('reads the title, repo and PR, and says it is your turn when Claude ended on text', () => {
    const text = ['{"cut off mid-li', j({ type: 'ai-title', aiTitle: 'Fix the  stock\npage' }), j({ type: 'pr-link', prUrl: 'https://github.com/o/vintage/pull/9' }),
        line('user', 'go'), line('assistant', [{ type: 'text', text: 'Done' }])].join('\n');
    expect(parseTail(text, 's1', NOW)).toEqual({ id: 's1', repo: 'vintage', title: 'Fix the stock page', state: 'waiting', at: '2026-11-13T11:00:00Z', prUrl: 'https://github.com/o/vintage/pull/9', questions: [] });
});

it('tells working, blocked and stopped apart, and falls back to the last prompt for a title', () => {
    const mid = (at: string) => [j({ type: 'last-prompt', lastPrompt: 'Ship it' }), line('assistant', [{ type: 'tool_use', name: 'Bash' }], at)].join('\n');
    expect(parseTail(mid('2026-11-13T11:59:30Z'), 's', NOW)).toMatchObject({ state: 'working', title: 'Ship it' });
    // A step going for an hour: a long build, or a permission prompt waiting on you
    expect(parseTail(mid('2026-11-13T10:00:00Z'), 's', NOW)).toMatchObject({ state: 'blocked' });
    expect(parseTail(line('user', [{ type: 'tool_result' }], '2026-11-13T10:00:00Z'), 's', NOW)).toMatchObject({ state: 'stopped', title: 'Untitled session' });
    expect(parseTail(j({ type: 'summary' }), 's', NOW)).toBeNull();
});

it('shows a pending question and its options, a plan to approve, and ignores a subagent turn', () => {
    const ask = line('assistant', [{ type: 'tool_use', name: 'AskUserQuestion', input: { questions: [{ question: 'Which  icons?', options: [{ label: 'Favicons' }, { label: 'Letters' }, { nope: 1 }] }, { bad: true }] } }]);
    expect(parseTail(ask, 's', NOW)).toMatchObject({ state: 'question', questions: [{ text: 'Which icons?', options: ['Favicons', 'Letters'] }] });
    expect(parseTail(line('assistant', [{ type: 'tool_use', name: 'ExitPlanMode' }]), 's', NOW)).toMatchObject({ state: 'question', questions: [{ text: 'Has a plan for you to approve', options: [] }] });
    const sub = j({ type: 'assistant', isSidechain: true, timestamp: '2026-11-13T11:30:00Z', message: { content: [{ type: 'text' }] } });
    expect(parseTail([ask, sub].join('\n'), 's', NOW)).toMatchObject({ state: 'question' });
});

it('counts the tokens Claude wrote since a time, each reply once', () => {
    const reply = (id: string, at: string, out: number) => j({ type: 'assistant', requestId: id, timestamp: at, message: { usage: { output_tokens: out } } });
    const text = [reply('r1', '2026-11-12T23:00:00Z', 500), reply('r2', '2026-11-13T09:00:00Z', 100), reply('r2', '2026-11-13T09:00:00Z', 100), reply('r3', '2026-11-13T10:00:00Z', 40), '{"broken'].join('\n');
    expect(tokensSince(text, Date.parse('2026-11-13T00:00:00Z'))).toBe(140);
});

it('builds the Claude Code extension links', () => {
    expect(resumeHref('a5f7')).toBe('vscode://anthropic.claude-code/open?session=a5f7');
    expect(resumeHref('a5f7', 'yes, go')).toBe('vscode://anthropic.claude-code/open?session=a5f7&prompt=yes%2C+go');
    expect(askHref('Review https://x/pull/1 & say')).toBe('vscode://anthropic.claude-code/open?prompt=Review+https%3A%2F%2Fx%2Fpull%2F1+%26+say');
});
