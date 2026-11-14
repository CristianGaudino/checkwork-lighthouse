import { expect, it } from 'vitest';
import { alertTask } from './security';

const p = { name: 'R', repo: 'r', site: 'r.ie', project: 1 };
const alert = (severity: string, pkg: string) => ({ severity, pkg });

it('makes a task only for high and critical alerts, naming the packages', () => {
    expect(alertTask(p, { on: true, open: [alert('MODERATE', 'a'), alert('LOW', 'b')] })).toBeNull();
    expect(alertTask(p, null)).toBeNull();
    expect(alertTask(p, { on: true, open: [alert('HIGH', 'next'), alert('CRITICAL', 'next'), alert('MODERATE', 'zod')] })).toMatchObject({
        level: 1, action: 'Fix 2 security alerts in', title: 'r', detail: 'High or critical, in next', href: 'https://github.com/CristianGaudino/r/security/dependabot',
    });
});
