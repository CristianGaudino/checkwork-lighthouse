'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { Event } from '@/lib/activity';
import { ProjectIcon } from './ProjectIcon';
import { panel } from './ui';

/**
 * Recent activity, with what happened since your last visit marked. The last visit is kept in this browser only; this
 * tab keeps the marks it opened with, so the page's minute-by-minute refresh doesn't clear them.
 */

const LAST = 'lighthouse.lastSeen';
const SINCE = 'lighthouse.since';

const get = (store: () => Storage, key: string) => { try { return store().getItem(key); } catch { return null; } };
const set = (store: () => Storage, key: string, value: string) => { try { store().setItem(key, value); } catch { /* not kept */ } };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const since = () => get(() => sessionStorage, SINCE);

const DOT: Record<Event['kind'], string> = {
    merged: 'bg-ok', release: 'bg-ok', deployed: 'bg-ok', up: 'bg-ok',
    opened: 'bg-fg-muted', issue: 'bg-fg-muted',
    failed: 'bg-bad', down: 'bg-bad',
};

const time = new Intl.DateTimeFormat('en-IE', { hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('en-IE', { weekday: 'long', day: 'numeric', month: 'short' });

function dayLabel(iso: string, now: Date) {
    const d = new Date(iso);
    const diff = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
    return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : day.format(d);
}

export function Feed({ events, compact }: { events: Event[]; compact?: boolean }) {
    const from = useSyncExternalStore(subscribe, since, () => null);
    // Times are shown in this browser's time zone, so only once it runs here (the server's zone would differ)
    const here = useSyncExternalStore(subscribe, () => true, () => false);

    useEffect(() => {
        // First page this tab: take the last visit as the line, then move the last visit to now
        if (since() === null) {
            set(() => sessionStorage, SINCE, get(() => localStorage, LAST) ?? '');
            listeners.forEach(fn => fn());
        }
        set(() => localStorage, LAST, new Date().toISOString());
    }, []);

    const isNew = (e: Event) => Boolean(from) && Date.parse(e.at) > Date.parse(from!);
    const fresh = events.filter(isNew).length;
    const now = new Date();

    if (!events.length) return <p className="mt-3 text-sm text-fg-muted">Nothing in the last week</p>;
    return (
        <>
            {/* The short list shows a few rows only, so its count would be wrong: Activity has the real one */}
            {from !== null && !compact && <p className="mt-1 text-sm text-fg-muted">{fresh ? `${fresh} new since you last looked` : from ? 'Nothing new since you last looked' : ''}</p>}
            <ul className={`${panel} text-sm`}>
                {events.map((e, i) => {
                    const label = dayLabel(e.at, now);
                    // A heading where the day changes
                    const head = here && !compact && (i === 0 || dayLabel(events[i - 1].at, now) !== label) ? label : null;
                    return (
                        <li key={`${e.kind} ${e.href} ${e.at}`}>
                            {head && <p className="bg-surface/50 px-4 py-1.5 text-xs text-fg-muted">{head}</p>}
                            <a href={e.href} target={e.href.startsWith('/') ? undefined : '_blank'} rel="noreferrer" className="group grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
                                <ProjectIcon project={e.repo} />
                                <span className="flex min-w-0 items-center gap-2">
                                    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DOT[e.kind]}`} />
                                    <span className="truncate group-hover:underline group-hover:underline-offset-4">{e.text}</span>
                                    {isNew(e) && <span className="shrink-0 text-xs font-medium text-accent-alt">New</span>}
                                </span>
                                <span className="text-fg-muted tabular-nums">{here && (compact && label !== 'Today' ? label : time.format(new Date(e.at)))}</span>
                            </a>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
