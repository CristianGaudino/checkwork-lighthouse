'use client';

import { useId, useRef, useState } from 'react';
import type { Image, Meta, RunView } from '@/lib/runner';

/**
 * Writing to a Claude Code session: the reply box with its slash-command menu and pictures (attach, paste or drop),
 * your buttons that send a saved prompt in one press, and the session's model, effort and permission mode.
 */

export type Picture = Image & { url: string };
/** Sends a message; false when it didn't go (the box keeps it). */
export type Say = (text: string, pictures?: Picture[]) => Promise<boolean>;

const PICTURE_MAX = 5 * 1024 * 1024; // the most Claude takes in one picture
const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const primary = 'rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-50';
const chip = 'shrink-0 rounded-full border border-line px-3 py-1 text-sm transition-colors hover:border-fg-muted active:scale-95 disabled:opacity-60';
const select = 'max-w-40 truncate rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-60';

const draftKey = (id: string) => `lighthouse.draft.${id}`;
const readDraft = (id: string) => { try { return localStorage.getItem(draftKey(id)) ?? ''; } catch { return ''; } };
const saveDraft = (id: string, text: string) => { try { if (text) localStorage.setItem(draftKey(id), text); else localStorage.removeItem(draftKey(id)); } catch { /* private window: no draft kept */ } };

/** The commands to offer for what's typed after "/": names that start with it first, shortest (closest) first, then names that contain it. */
export function commandsFor(typed: string, commands: Meta['commands'], max = 8) {
    const q = typed.toLowerCase();
    const rank = (name: string) => (name.toLowerCase().startsWith(q) ? 0 : 1);
    return commands.filter(c => c.name.toLowerCase().includes(q)).sort((a, b) => rank(a.name) - rank(b.name) || a.name.length - b.name.length).slice(0, max);
}

function readPicture(file: File): Promise<Picture> {
    return new Promise((resolve, reject) => {
        if (!TYPES.includes(file.type)) return reject(new Error('Pictures can be PNG, JPEG, GIF or WebP.'));
        if (file.size > PICTURE_MAX) return reject(new Error(`${file.name || 'That picture'} is over 5 MB.`));
        const reader = new FileReader();
        // The data: address is also the preview: the site's CSP allows data: pictures, not blob:
        reader.onload = () => resolve({ type: file.type as Image['type'], data: String(reader.result).split(',')[1] ?? '', url: String(reader.result) });
        reader.onerror = () => reject(new Error('That picture could not be read.'));
        reader.readAsDataURL(file);
    });
}

/**
 * The reply box: Enter sends, Shift+Enter makes a new line, "/" lists the session's commands. Only ever rendered in the
 * browser (after the first load), so it can start from the draft you left in this session and take the focus on a computer.
 */
export function Composer({ id, commands, onSay, onError }: { id: string; commands: Meta['commands']; onSay: Say; onError: (e: string) => void }) {
    const [text, setText] = useState(() => readDraft(id));
    const [pictures, setPictures] = useState<Picture[]>([]);
    const [busy, setBusy] = useState(false);
    const [pick, setPick] = useState(0); // the highlighted command
    const [closed, setClosed] = useState(false); // Escape hides the menu until you type again
    const [focus] = useState(() => window.matchMedia('(pointer: fine)').matches); // a phone's keyboard shouldn't pop up by itself
    const box = useRef<HTMLTextAreaElement>(null);
    const file = useRef<HTMLInputElement>(null);
    const menuId = useId();
    const change = (t: string) => { setText(t); saveDraft(id, t); setPick(0); setClosed(false); };
    const typed = text.match(/^\/(\S*)$/)?.[1];
    const menu = typed !== undefined && !closed ? commandsFor(typed, commands) : [];

    const add = async (files: Iterable<File>) => {
        const list = [...files].filter(f => f.type.startsWith('image/'));
        if (!list.length) return;
        try {
            const read = await Promise.all(list.map(readPicture));
            setPictures(p => {
                if (p.length + read.length > 4) onError('Up to 4 pictures at a time.');
                return [...p, ...read].slice(0, 4);
            });
        } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    };
    const choose = (name: string) => { change(`/${name} `); box.current?.focus(); };
    const sendIt = async () => {
        const t = text.trim();
        if ((!t && !pictures.length) || busy) return;
        const sent = pictures;
        setBusy(true);
        change(''); setPictures([]);
        if (!(await onSay(t, sent))) { change(text); setPictures(sent); }
        setBusy(false);
    };

    return (
        <form
            onSubmit={e => { e.preventDefault(); void sendIt(); }}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
            onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); void add(e.dataTransfer.files); } }}
            className="relative grid gap-2"
        >
            {menu.length > 0 && (
                <ul id={menuId} role="listbox" aria-label="Commands" className="absolute inset-x-0 bottom-full mb-2 max-h-72 animate-pop overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg shadow-black/30">
                    {menu.map((c, i) => (
                        <li key={c.name} id={`${menuId}-${i}`} role="option" aria-selected={i === pick}
                            onMouseDown={e => { e.preventDefault(); choose(c.name); }}
                            onMouseEnter={() => setPick(i)}
                            className="flex cursor-pointer items-baseline gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-canvas">
                            <span className="shrink-0 font-medium">/{c.name}{c.hint && <span className="font-normal text-fg-muted"> {c.hint}</span>}</span>
                            <span className="min-w-0 truncate text-fg-muted">{c.description}</span>
                        </li>
                    ))}
                </ul>
            )}
            {pictures.length > 0 && (
                <ul className="flex gap-2" aria-label="Pictures to send">
                    {pictures.map((p, i) => (
                        <li key={p.url} className="relative animate-pop">
                            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, nothing to optimise */}
                            <img src={p.url} alt={`Picture ${i + 1}`} className="size-16 rounded-lg border border-line object-cover" />
                            <button type="button" aria-label={`Remove picture ${i + 1}`} onClick={() => setPictures(ps => ps.filter(x => x !== p))}
                                className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border border-line bg-surface text-fg-muted hover:text-fg">
                                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex items-end gap-2">
                <button type="button" aria-label="Add a picture" onClick={() => file.current?.click()} className="grid size-11 shrink-0 place-items-center rounded-xl border border-line text-fg-muted transition-colors hover:text-fg">
                    <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M21 16l-5-5-8 8" /></svg>
                </button>
                <input ref={file} type="file" accept={TYPES.join(',')} multiple hidden onChange={e => { if (e.target.files) void add(e.target.files); e.target.value = ''; }} />
                <textarea
                    ref={box}
                    autoFocus={focus}
                    value={text}
                    onChange={e => change(e.target.value)}
                    onPaste={e => { const files = [...e.clipboardData.files]; if (files.some(f => f.type.startsWith('image/'))) { e.preventDefault(); void add(files); } }}
                    onKeyDown={e => {
                        if (menu.length) {
                            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setPick(p => (p + (e.key === 'ArrowDown' ? 1 : menu.length - 1)) % menu.length); return; }
                            // Enter on a command typed in full sends it, as in Claude Code; otherwise it fills in the one picked
                            const whole = e.key === 'Enter' && menu[pick]?.name === typed;
                            if (!whole && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) { e.preventDefault(); choose(menu[pick]?.name ?? menu[0].name); return; }
                            if (e.key === 'Escape') { e.preventDefault(); setClosed(true); return; }
                        }
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendIt(); }
                    }}
                    rows={Math.min(8, Math.max(1, text.split('\n').length))}
                    placeholder="Reply, or / for commands"
                    aria-label="Reply to Claude"
                    aria-controls={menu.length ? menuId : undefined}
                    aria-activedescendant={menu.length ? `${menuId}-${pick}` : undefined}
                    className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-fg transition-colors placeholder:text-fg-muted focus:border-fg-muted"
                />
                <button type="submit" disabled={busy || (!text.trim() && !pictures.length)} className={`${primary} h-11 px-4`}>Send</button>
            </div>
        </form>
    );
}

type Macro = { label: string; text: string };
const MACROS = 'lighthouse.macros';
// A start you can change or delete: the steps this owner asks for most
const FIRST: Macro[] = [
    { label: 'Continue', text: 'Continue.' },
    { label: 'Audit and fix', text: '/ponytail:ponytail-audit what this branch changed, then fix what it finds and repeat until it finds nothing.' },
    { label: 'Run the checks', text: 'Run lint, typecheck, the tests, the build and e2e, and fix anything that fails.' },
    { label: 'Open the PR', text: 'Commit what is done, push, and open the PR against main as the project rules say. Do not merge it.' },
];
const readMacros = (): Macro[] => {
    try {
        const saved = JSON.parse(localStorage.getItem(MACROS) ?? 'null');
        return Array.isArray(saved) ? saved.filter((m): m is Macro => typeof m?.label === 'string' && typeof m?.text === 'string') : FIRST;
    } catch { return FIRST; }
};

/** Your buttons: each sends its prompt in one press (a slash command works too). Kept in this browser. */
export function Macros({ onSay }: { onSay: Say }) {
    const [macros, setMacros] = useState(readMacros);
    const [editing, setEditing] = useState(false);
    const [sending, setSending] = useState<number | null>(null);
    const save = (next: Macro[]) => { setMacros(next); try { localStorage.setItem(MACROS, JSON.stringify(next)); } catch { /* private window: kept until you leave */ } };
    const press = async (i: number) => { setSending(i); await onSay(macros[i].text); setSending(null); };
    if (editing) {
        const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg';
        return (
            <div className="grid animate-rise gap-3 rounded-2xl border border-line p-3 text-sm">
                <p className="text-fg-muted">Each button sends its prompt when pressed. Kept in this browser.</p>
                {macros.map((m, i) => (
                    <div key={i} className="grid gap-2 border-b border-line pb-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-start">
                        <input value={m.label} onChange={e => save(macros.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Button" aria-label={`Button ${i + 1} name`} className={field} />
                        <textarea value={m.text} onChange={e => save(macros.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} rows={2} placeholder="What it sends" aria-label={`Button ${i + 1} prompt`} className={`${field} resize-y`} />
                        <button type="button" onClick={() => save(macros.filter((_, j) => j !== i))} className="justify-self-start rounded-lg px-2 py-2 text-fg-muted hover:text-bad">Remove</button>
                    </div>
                ))}
                <div className="flex gap-2">
                    <button type="button" onClick={() => save([...macros, { label: '', text: '' }])} className={chip}>Add a button</button>
                    <button type="button" onClick={() => { save(macros.filter(m => m.label.trim() && m.text.trim())); setEditing(false); }} className={`${primary} rounded-full`}>Done</button>
                </div>
            </div>
        );
    }
    return (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            {/* A half-made one (left mid-edit) has nothing to send */}
            {macros.map((m, i) => m.label.trim() && m.text.trim() && (
                <button key={i} type="button" title={m.text} disabled={sending === i} onClick={() => void press(i)} className={chip}>{m.label}</button>
            ))}
            <button type="button" onClick={() => setEditing(true)} className={`${chip} text-fg-muted`}>{macros.length ? 'Edit buttons' : 'Add a button'}</button>
        </div>
    );
}

const MODE_LABELS: Record<string, string> = { default: 'Ask before acting', acceptEdits: 'Accept edits', plan: 'Plan first', auto: 'Auto' };
const EFFORT_LABELS: Record<string, string> = { low: 'Low effort', medium: 'Medium effort', high: 'High effort', xhigh: 'Extra high effort', max: 'Max effort' };

/** The session's model, effort and permission mode, changed for the run going now and any started later. */
export function Settings({ run, models, onSet }: { run: RunView | null; models: Meta['models'] | null; onSet: (change: { model?: string; effort?: string | null; mode?: string }) => void }) {
    const current = models?.find(m => m.value === run?.model) ?? models?.find(m => m.resolved === run?.model);
    const efforts = current?.efforts ?? [];
    const mode = run?.mode ?? 'default';
    const off = !models || !run;
    return (
        <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Model" disabled={off} value={current?.value ?? run?.model ?? ''} onChange={e => onSet({ model: e.target.value })} className={select}>
                {!current && <option value={run?.model ?? ''}>{run?.model ?? 'Model'}</option>}
                {models?.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            {efforts.length > 0 && (
                <select aria-label="Effort" disabled={off} value={run?.effort ?? ''} onChange={e => onSet({ effort: e.target.value || null })} className={select}>
                    <option value="">Default effort</option>
                    {efforts.map(l => <option key={l} value={l}>{EFFORT_LABELS[l] ?? l}</option>)}
                </select>
            )}
            <select aria-label="Permission mode" disabled={off} value={mode} onChange={e => onSet({ mode: e.target.value })} className={select}>
                {!(mode in MODE_LABELS) && <option value={mode}>{mode}</option>}
                {Object.entries(MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
        </div>
    );
}
