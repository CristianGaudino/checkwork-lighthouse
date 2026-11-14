import { expect, it } from 'vitest';
import { parseBranches, parseStatus, staleInstall } from './local';

it('reads branch, ahead, behind and changed files from git status', () => {
    expect(parseStatus('## main...origin/main [ahead 1, behind 2]\n M a.ts\n?? b.ts\n')).toEqual({ branch: 'main', changed: 2, ahead: 1, behind: 2 });
    expect(parseStatus('## main...origin/main [behind 4]\n')).toEqual({ branch: 'main', changed: 0, ahead: 0, behind: 4 });
    expect(parseStatus('## feat/x\n M a.ts\n')).toEqual({ branch: 'feat/x', changed: 1, ahead: 0, behind: 0 });
    expect(parseStatus('## HEAD (no branch)\n')).toMatchObject({ branch: 'detached' });
    expect(parseStatus('## No commits yet on main\n')).toMatchObject({ branch: 'main' });
});

it('sorts other branches into never pushed, remote gone and old, skipping the current one', () => {
    const NOW = Date.parse('2026-11-13T12:00:00Z');
    const recent = String(NOW / 1000 - 86_400), ancient = String(NOW / 1000 - 90 * 86_400);
    const text = [
        `main\trefs/remotes/origin/main\t\t${ancient}`,
        `local-only\t\t\t${recent}`,
        `merged\trefs/remotes/origin/merged\t[gone]\t${recent}`,
        `dusty\trefs/remotes/origin/dusty\t\t${ancient}`,
        `fresh\trefs/remotes/origin/fresh\t[ahead 1]\t${recent}`,
    ].join('\n');
    expect(parseBranches(text, 'main', NOW)).toEqual({ notPushed: ['local-only'], goneRemote: ['merged'], old: ['dusty'] });
});

it('counts packages the lockfile wants that are not installed as it says', () => {
    const lock = { packages: { '': { version: '1.0.0' }, 'node_modules/a': { version: '1.0.0' }, 'node_modules/b': { version: '2.0.0' }, 'node_modules/@esbuild/linux-x64': { version: '0.1.0', optional: true } } };
    // In step, the other platform's optional package not installed
    expect(staleInstall(lock, { packages: { 'node_modules/a': { version: '1.0.0' }, 'node_modules/b': { version: '2.0.0' } } })).toBe(0);
    // b moved on in a pull, and c was removed from the lockfile
    expect(staleInstall(lock, { packages: { 'node_modules/a': { version: '1.0.0' }, 'node_modules/b': { version: '1.9.0' }, 'node_modules/c': { version: '1.0.0' } } })).toBe(2);
    expect(staleInstall(lock, null)).toBe(2);
});
