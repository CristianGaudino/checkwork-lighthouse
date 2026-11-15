import { expect, it } from 'vitest';
import { checkBump } from './act';
import { canSnooze, readSnoozed, snooze } from './snooze';

it('keeps snoozes still asleep and reads anything broken as none', () => {
    expect(readSnoozed(JSON.stringify({ a: 200, b: 50, c: 'x' }), 100)).toEqual({ a: 200 });
    expect([readSnoozed('not json', 0), readSnoozed('[1]', 0), readSnoozed('null', 0), readSnoozed(undefined, 0)]).toEqual([{}, {}, {}, {}]);
    expect(readSnoozed(JSON.stringify({ ['k'.repeat(301)]: 200 }), 100)).toEqual({});
});

it('snoozes for whole days, and drops the soonest to wake past twenty', () => {
    expect(snooze({}, 'a', 1, 0)).toEqual({ a: 86_400_000 });
    const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 1000 + i]));
    const next = snooze(many, 'new', 7, 0);
    expect(Object.keys(next)).toHaveLength(20);
    expect(next.new).toBe(7 * 86_400_000);
    expect(next.k0).toBeUndefined();
});

it('never hides a red task: a site down or main failing comes back under the same key', () => {
    expect([canSnooze(1), canSnooze(2)]).toEqual([false, true]);
});

it('only lets a release bump the workflow offers through', () => {
    expect([checkBump('patch'), checkBump('minor'), checkBump('major')]).toEqual(['patch', 'minor', 'major']);
    expect([checkBump('huge'), checkBump(null), checkBump('')]).toEqual([null, null, null]);
});
