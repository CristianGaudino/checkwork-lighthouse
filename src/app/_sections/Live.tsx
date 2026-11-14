'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Beat, BeatKind } from '@/lib/pulse';
import { freshKeys } from '@/lib/seen';

export const KINDS: { kind: Exclude<BeatKind, 'other'>; label: string }[] = [
    { kind: 'down', label: 'A site goes down' },
    { kind: 'main', label: 'Main fails' },
    { kind: 'pr', label: 'A PR is ready to merge' },
    { kind: 'claude', label: 'A Claude session needs you' },
];

/**
 * Keeps an open tab current: reloads its data every minute while it is on screen (or always, once notifications are on), puts the count of things that need
 * you in the tab title and on the installed app's icon, and shows a desktop notification for anything new of a kind
 * the owner turned on. Settings and what was already seen live in this browser only; storage that fails just means
 * no notifications, never a broken page.
 */

const EVERY = 60_000;
const SEEN = 'lighthouse.seenAt';
const PREFS = 'lighthouse.notify';

type Prefs = { on: boolean; kinds: Partial<Record<BeatKind, boolean>> };
const OFF: Prefs = { on: false, kinds: {} };

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private window: nothing kept */ } };

// One parsed copy per stored string, so useSyncExternalStore sees a stable value
let cached: { raw: string | null; prefs: Prefs } = { raw: null, prefs: OFF };
function prefs(): Prefs {
    const raw = read(PREFS);
    if (raw !== cached.raw) {
        let parsed = OFF;
        try { parsed = raw ? { ...OFF, ...JSON.parse(raw) } : OFF; } catch { /* a broken value reads as off */ }
        cached = { raw, prefs: parsed };
    }
    return cached.prefs;
}
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
    listeners.add(fn);
    window.addEventListener('storage', fn);
    return () => { listeners.delete(fn); window.removeEventListener('storage', fn); };
};
const save = (p: Prefs) => { write(PREFS, JSON.stringify(p)); listeners.forEach(fn => fn()); };
const usePrefs = () => useSyncExternalStore(subscribe, prefs, () => OFF);

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

export function Live({ beats }: { beats: Beat[] }) {
    const router = useRouter();
    const path = usePathname();

    useEffect(() => {
        let last = Date.now();
        const tick = () => {
            // A tab out of sight still refreshes once notifications are on: that's when they're needed
            if ((document.visibilityState !== 'visible' && !prefs().on) || Date.now() - last < EVERY - 5000) return;
            last = Date.now();
            router.refresh();
        };
        const timer = setInterval(tick, EVERY);
        document.addEventListener('visibilitychange', tick);
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
    }, [router]);

    const count = beats.length;
    useEffect(() => {
        const base = document.title.replace(/^\(\d+\) /, '');
        document.title = count ? `(${count}) ${base}` : base;
        const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
        (count ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {});
    }, [count, path]);

    useEffect(() => {
        const { fresh, store, first } = freshKeys(beats.map(b => b.key), read(SEEN));
        write(SEEN, store);
        // The first visit only learns what is already there
        if (first || !canNotify() || Notification.permission !== 'granted') return;
        const p = prefs();
        if (!p.on) return;
        for (const b of beats) {
            if (!fresh.includes(b.key) || !p.kinds[b.kind]) continue;
            // tag: two open tabs show one notification, not two
            const n = new Notification(b.title, { body: b.body, tag: b.key, icon: '/icon-192.png' });
            n.onclick = () => { window.focus(); if (b.href.startsWith('/')) router.push(b.href); else window.open(b.href, b.href.startsWith('http') ? '_blank' : '_self'); };
        }
    }, [beats, router]);

    return null;
}

/** Turn notifications on, and pick which kinds. Shown on the Overview. */
export function NotifySettings() {
    const p = usePrefs();
    // Read through the store, so the server's render ('default') and the browser's first one agree
    const permission = useSyncExternalStore(subscribe, () => (canNotify() ? Notification.permission : 'unsupported'), () => 'default');
    if (permission === 'unsupported') return <p className="mt-3 text-sm text-fg-muted">This browser can&apos;t show notifications. On an iPhone, add Lighthouse to the home screen first.</p>;

    const turnOn = async () => {
        const answer = await Notification.requestPermission();
        if (answer === 'granted') save({ on: true, kinds: Object.fromEntries(KINDS.map(k => [k.kind, true])) });
        else listeners.forEach(fn => fn()); // show "blocked" if they said no
    };
    const blocked = permission === 'denied';
    if (!p.on) {
        return (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
                <button type="button" onClick={turnOn} disabled={blocked} className="rounded-lg border border-line bg-surface px-3 py-1.5 font-medium text-fg transition-colors hover:border-fg-muted disabled:opacity-60">Turn on notifications</button>
                <span>{blocked ? 'Blocked for this site. Allow them in the browser’s site settings.' : 'While a Lighthouse tab is open'}</span>
            </div>
        );
    }
    return (
        <div className="mt-3 grid gap-2 text-sm">
            <ul className="grid gap-2 sm:grid-cols-2">
                {KINDS.map(k => (
                    <li key={k.kind}>
                        <label className="flex items-center gap-3">
                            <input type="checkbox" className="size-4 accent-accent" checked={Boolean(p.kinds[k.kind])} onChange={e => save({ ...p, kinds: { ...p.kinds, [k.kind]: e.target.checked } })} />
                            {k.label}
                        </label>
                    </li>
                ))}
            </ul>
            <button type="button" onClick={() => save(OFF)} className="w-fit text-fg-muted underline-offset-4 hover:text-fg hover:underline">Turn off</button>
        </div>
    );
}
