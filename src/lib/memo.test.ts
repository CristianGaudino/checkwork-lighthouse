import { beforeEach, expect, it } from 'vitest';
import { forgetAll, memo } from './memo';

beforeEach(forgetAll);

it('serves the remembered answer until it expires, and shares one fetch between calls made together', async () => {
    let calls = 0;
    const fetchIt = async () => ++calls;
    const [a, b] = await Promise.all([memo('k', 1000, fetchIt, 0), memo('k', 1000, fetchIt, 10)]);
    expect([a, b, calls]).toEqual([1, 1, 1]);
    expect(await memo('k', 1000, fetchIt, 999)).toBe(1);
    expect(await memo('k', 1000, fetchIt, 1000)).toBe(2);
});

it('never remembers a failure, and forgetAll starts fresh', async () => {
    let calls = 0;
    await expect(memo('f', 1000, async () => { calls++; throw new Error('down'); }, 0)).rejects.toThrow('down');
    expect(await memo('f', 1000, async () => ++calls, 1)).toBe(2);
    forgetAll();
    expect(await memo('f', 1000, async () => ++calls, 2)).toBe(3);
});
