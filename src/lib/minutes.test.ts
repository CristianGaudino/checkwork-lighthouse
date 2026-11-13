import { expect, it } from 'vitest';
import { minutesTask, summarise } from './minutes';

const item = (repositoryName: string, quantity: number, sku = 'Actions Linux', unitType = 'Minutes') => ({ product: 'actions', sku, quantity, unitType, repositoryName });

it('adds up minutes by repo with runner multipliers, ignoring storage and other products', () => {
    const m = summarise([
        item('vintage', 392), item('vintage', 8), item('blacktail', 10, 'Actions Windows'),
        item('vintage', 1.9, 'Actions storage', 'GigabyteHours'), { product: 'copilot', sku: 'x', quantity: 99, unitType: 'Minutes' }, { junk: true },
        item('checkwork', 999),
    ], new Set(['checkwork']), new Date('2026-11-16T00:00:00Z'));
    expect(m.byRepo).toEqual([{ repo: 'vintage', minutes: 400, free: false }, { repo: 'blacktail', minutes: 20, free: false }, { repo: 'checkwork', minutes: 999, free: true }]);
    expect(m.used).toBe(420);
    expect(m.projected).toBe(840); // half of November gone
    expect(m.monthEnd.toISOString()).toBe('2026-12-01T00:00:00.000Z');
});

it('asks to slow down when on pace to go over, and says when the allowance is gone', () => {
    const at = (used: number, projected: number) => minutesTask({ used, projected, byRepo: [], monthEnd: new Date() });
    expect(at(500, 1500)).toBeNull();
    expect(at(1200, 2400)).toMatchObject({ level: 2, title: 'on pace for 2,400 minutes' });
    expect(at(2000, 2600)).toMatchObject({ level: 1, title: '2,000 of 2,000 used' });
});
