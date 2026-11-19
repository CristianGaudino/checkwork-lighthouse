/**
 * Snoozed tasks, by key (taskKey), with when each wakes. Kept in a cookie in this browser: the server leaves them out of
 * every count, list and notification in one place, and nothing is stored anywhere else. Only amber (level 2) tasks
 * snooze: a red one (a site down, main failing) keeps its key the next time, and must never be hidden.
 */

export const SNOOZE_COOKIE = 'lighthouse.snooze';
export const SNOOZE_DAYS = [1, 7] as const;
const MAX = 20; // a cookie holds about 4 KB, and keys grow by a third once encoded

export type Snoozed = Record<string, number>;

/** The cookie's snoozes still asleep. Anything unreadable reads as none. */
export function readSnoozed(raw: string | undefined, now = Date.now()): Snoozed {
    try {
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter(([k, until]) => k.length <= 300 && typeof until === 'number' && until > now));
    } catch {
        return {};
    }
}

export const canSnooze = (level: number) => level === 2;

/** Adds one, keeping the ones that wake last when there are too many. */
export function snooze(s: Snoozed, key: string, days: number, now = Date.now()): Snoozed {
    // A Claude session's Done replaces its earlier one: that key went stale at the session's next turn
    const session = key.match(/^claude \S+ /)?.[0];
    const kept = session ? Object.fromEntries(Object.entries(s).filter(([k]) => !k.startsWith(session))) : s;
    const all = Object.entries({ ...kept, [key]: now + days * 86_400_000 }).sort((a, b) => b[1] - a[1]).slice(0, MAX);
    return Object.fromEntries(all);
}
