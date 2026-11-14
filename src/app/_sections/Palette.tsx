'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { askHref } from '@/lib/vscode';
import { matches, type Jump } from '@/lib/palette';
import { ProjectIcon } from './ProjectIcon';

const SHOWN = 12;
export const OPEN_PALETTE = 'lighthouse:palette';

/** Opens the palette from anywhere: the Nav's search button sends this. */
export const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE));

/**
 * Ctrl+K (Cmd+K on a Mac) from any page: type a few letters of a project, page, PR or dashboard and press Enter.
 * Locally, typed text that matches nothing can go to Claude Code as a prompt.
 */
export function Palette({ jumps, local }: { jumps: Jump[]; local: boolean }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [at, setAt] = useState(0);

    useEffect(() => {
        const open = () => { if (dialog.current?.open) return; setQuery(''); setAt(0); dialog.current?.showModal(); };
        const key = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); open(); } };
        window.addEventListener('keydown', key);
        window.addEventListener(OPEN_PALETTE, open);
        return () => { window.removeEventListener('keydown', key); window.removeEventListener(OPEN_PALETTE, open); };
    }, []);

    const found = (query.trim() ? jumps.filter(j => matches(j, query)) : jumps).slice(0, SHOWN);
    const ask: Jump | null = local && query.trim() ? { label: `Ask Claude: ${query.trim()}`, hint: 'Claude Code', href: askHref(query.trim()) } : null;
    const list = ask ? [...found, ask] : found;
    const pick = list[Math.min(at, list.length - 1)];

    const go = (j: Jump) => {
        dialog.current?.close();
        if (j.href.startsWith('/')) router.push(j.href);
        else if (j.href.startsWith('http')) window.open(j.href, '_blank', 'noreferrer');
        else window.location.assign(j.href); // vscode:// opens the editor
    };

    return (
        <dialog
            ref={dialog}
            aria-label="Go to"
            onClick={e => { if (e.target === dialog.current) dialog.current.close(); }}
            className="m-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-line bg-canvas p-0 text-fg shadow-2xl shadow-black/40 backdrop:bg-black/50"
        >
            <input
                autoFocus
                value={query}
                onChange={e => { setQuery(e.target.value); setAt(0); }}
                onKeyDown={e => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setAt(i => Math.min(i + 1, list.length - 1)); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setAt(i => Math.max(i - 1, 0)); }
                    if (e.key === 'Enter' && pick) { e.preventDefault(); go(pick); }
                }}
                placeholder="Go to a project, page or PR"
                aria-label="Go to"
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-list"
                aria-activedescendant={pick ? `palette-${list.indexOf(pick)}` : undefined}
                className="w-full border-b border-line bg-transparent px-4 py-3 text-[15px] outline-none placeholder:text-fg-muted"
            />
            <ul id="palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
                {list.map((j, i) => (
                    <li key={`${j.href} ${j.label}`} id={`palette-${i}`} role="option" aria-selected={j === pick}>
                        <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => go(j)}
                            onMouseMove={() => setAt(i)}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${j === pick ? 'bg-surface' : ''}`}
                        >
                            {j.project ? <ProjectIcon project={j.project} /> : <span className="size-5 shrink-0" />}
                            <span className="min-w-0 flex-1 truncate">{j.label}</span>
                            <span className="shrink-0 text-fg-muted">{j.hint}</span>
                        </button>
                    </li>
                ))}
                {!list.length && <li className="px-3 py-2 text-sm text-fg-muted">Nothing matches</li>}
            </ul>
        </dialog>
    );
}
