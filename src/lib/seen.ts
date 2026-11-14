/** How long a key is remembered after it was last on screen. */
export const FORGET_MS = 15 * 60_000;

/**
 * Which of `keys` are new, given what was stored last time, and what to store now. Each key keeps the time it was last
 * on screen for a while after it goes: a source that fails for one refresh drops its tasks, and they must not all come
 * back as new the next minute. `first`: nothing usable was stored, so nothing counts as new.
 */
export function freshKeys(keys: string[], stored: string | null, now = Date.now()): { fresh: string[]; store: string; first: boolean } {
    // A broken or old-format value starts over like a first visit, so it can never cause a burst
    let seen: Record<string, number> | null = null;
    try {
        const parsed: unknown = stored ? JSON.parse(stored) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) seen = parsed as Record<string, number>;
    } catch { /* starts over */ }
    const first = seen === null;
    seen ??= {};
    const next = Object.fromEntries(Object.entries(seen).filter(([, at]) => typeof at === 'number' && now - at < FORGET_MS));
    const fresh = keys.filter(k => !(k in next));
    for (const k of keys) next[k] = now;
    return { fresh, store: JSON.stringify(next), first };
}
