/**
 * Remembers an answer for a short while so a reload doesn't wait on every outside API again.
 * shortcut: memory of one Worker instance, so a request that lands on a fresh instance fetches anew; fine for one owner, move to the Cache API or KV if that ever shows.
 */
const store = new Map<string, { at: number; value: Promise<unknown> }>();

/** The promise itself is kept, so calls made at the same time share one fetch. A failure is forgotten at once, never served again. */
export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>, now = Date.now()): Promise<T> {
    const hit = store.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = fn();
    store.set(key, { at: now, value });
    value.catch(() => { if (store.get(key)?.value === value) store.delete(key); });
    return value;
}

/** Forget everything, for the page's Refresh link. */
export const forgetAll = () => store.clear();

export const MINUTE = 60_000;
