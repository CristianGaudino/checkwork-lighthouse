import { expect, it } from 'vitest';
import { beats } from './pulse';
import type { Task } from './today';

const task = (project: string): Task => ({ project, level: 2, action: 'Add a monitor', detail: 'No monitor yet', href: '/' });

it("notifies an idle project's task quietly, out of the count, and a counted one as usual", () => {
    const [counted, idle] = [task('Checkwork'), task('Topdown')];
    const out = beats([counted], null, [idle]);
    expect(out.map(b => [b.body.split('.')[0], Boolean(b.quiet)])).toEqual([['Checkwork', false], ['Topdown', true]]);
    // Muted tasks are passed to neither list, so they never notify
    expect(beats([counted], null, [])).toHaveLength(1);
});
