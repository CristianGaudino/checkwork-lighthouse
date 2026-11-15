'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@/lib/claude';
import type { Ask, RunView } from '@/lib/runner';
import type { Entry } from '@/lib/transcript';
import { resumeHref } from '@/lib/vscode';
import { Markdown } from './Markdown';
import { Bone, Dots } from './ui';

/**
 * One Claude Code session, used from Lighthouse: its whole history (older parts load as you scroll up), what it is
 * doing now, its questions and permission requests to answer, and a box to reply. Polls the session's transcript:
 * quickly while it works, slowly while it waits.
 */

type Slice = { entries: Entry[]; start: number; end: number; size: number; reset?: boolean; session: Session | null; run: RunView | null; elsewhere: boolean };

const FAST = 1500, SLOW = 5000;
const NEAR = 120; // px from an edge that counts as "at" it

const SAID: Record<Session['state'], string> = {
    question: 'Asking you something', blocked: 'Waiting for your OK, or on a long step', waiting: 'Your turn', working: 'Working', stopped: 'Stopped mid-task',
};

const button = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-fg-muted disabled:opacity-60';
const primary = 'rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-50';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function api(id: string, init?: { query?: string; body?: object }) {
    const res = await fetch(`/api/claude/${id}${init?.query ? `?${init.query}` : ''}`, init?.body
        ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }
        : { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error ?? `Lighthouse answered ${res.status}`);
    return json;
}

export function Conversation({ id }: { id: string }) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [range, setRange] = useState<{ start: number; end: number; size: number } | null>(null);
    const [info, setInfo] = useState<Pick<Slice, 'session' | 'run' | 'elsewhere'> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [older, setOlder] = useState(false);
    const [fresh, setFresh] = useState<Set<string>>(new Set()); // came in live: these fade in
    const [outbox, setOutbox] = useState<string[]>([]); // sent, not in the transcript yet
    const [unread, setUnread] = useState(0); // arrived while you were scrolled up
    const [away, setAway] = useState(false);
    const [stopping, setStopping] = useState(false);
    const scroller = useRef<HTMLDivElement>(null);
    const stick = useRef(true); // at the bottom: new messages keep it there
    const keep = useRef<number | null>(null); // height before older messages went in on top

    // The newest part of the conversation; `round` goes up to load it afresh (the transcript was replaced)
    const [round, setRound] = useState(0);
    const load = useCallback(() => setRound(r => r + 1), []);
    useEffect(() => {
        let current = true;
        api(id).then(
            (s: Slice) => {
                if (!current) return;
                stick.current = true;
                setEntries(s.entries); setRange({ start: s.start, end: s.end, size: s.size }); setInfo(s); setError(null);
            },
            e => { if (current) setError(message(e)); },
        );
        return () => { current = false; };
    }, [id, round]);

    // New lines while it runs: quickly when something is happening, slowly otherwise, never in a hidden tab
    const busy = info?.run?.state === 'working' || info?.session?.state === 'working' || info?.session?.state === 'blocked' || Boolean(info?.run?.asks.length) || outbox.length > 0;
    useEffect(() => {
        if (!range) return;
        const timer = setTimeout(async () => {
            if (document.visibilityState !== 'visible') { setRange(r => (r ? { ...r } : r)); return; }
            try {
                const s = (await api(id, { query: `after=${range.end}` })) as Slice;
                if (s.reset) { load(); return; }
                const el = scroller.current;
                stick.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
                if (s.entries.length) {
                    setEntries(es => [...es, ...s.entries]);
                    setFresh(new Set(s.entries.map(e => e.id)));
                    // Each message of yours in the transcript is the oldest one still waiting: by count, not by text,
                    // so a message Claude Code stored a little differently can't stay "sending" forever
                    const said = s.entries.filter(e => e.kind === 'you').length;
                    setOutbox(o => o.slice(said));
                    if (!stick.current) setUnread(u => u + s.entries.filter(e => e.kind === 'you' || e.kind === 'claude').length);
                }
                setRange(r => (r ? { start: r.start, end: s.end, size: s.size } : r));
                setInfo(s); setError(null);
            } catch (e) {
                setError(message(e));
                setRange(r => (r ? { ...r } : r)); // try again next round
            }
        }, busy ? FAST : SLOW);
        return () => clearTimeout(timer);
    }, [id, range, busy, load]);

    // The piece already asked for, by where it ends: scroll events come faster than renders, so state can't tell
    const asked = useRef<number | null>(null);
    const loadOlder = useCallback(async () => {
        if (!range || range.start === 0 || asked.current === range.start) return;
        asked.current = range.start;
        setOlder(true);
        try {
            const s = (await api(id, { query: `before=${range.start}` })) as Slice;
            keep.current = scroller.current?.scrollHeight ?? null;
            setEntries(es => [...s.entries, ...es]);
            setRange(r => (r ? { ...r, start: s.start } : r));
        } catch (e) { asked.current = null; setError(message(e)); } finally { setOlder(false); }
    }, [id, range]);

    // Keep the view still when older messages go in above, and at the bottom when new ones arrive
    useLayoutEffect(() => {
        const el = scroller.current;
        if (!el) return;
        if (keep.current !== null) { el.scrollTop += el.scrollHeight - keep.current; keep.current = null; } else if (stick.current) el.scrollTop = el.scrollHeight;
    }, [entries, outbox]);

    const toBottom = () => {
        const el = scroller.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    };
    const onScroll = (el: HTMLDivElement) => {
        if (el.scrollTop < NEAR) void loadOlder();
        const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
        setAway(!bottom);
        if (bottom) setUnread(0);
    };

    const stop = async () => {
        setStopping(true);
        try { await api(id, { body: { action: 'stop' } }); } catch (e) { setError(message(e)); } finally { setStopping(false); }
    };

    const results = new Map(entries.flatMap(e => (e.kind === 'result' ? [[e.toolId, e] as const] : [])));
    const shown = entries.filter(e => e.kind !== 'result');
    const run = info?.run, session = info?.session;
    // The list beside this stays put between sessions (the layout's), so it's brought up to date when this one opens or
    // changes state: a session just started appears in it, and a reply turns "Your turn" into "Working" there too
    const router = useRouter();
    const state = session?.state;
    useEffect(() => { if (state) router.refresh(); }, [state, router]);
    const working = run?.state === 'working' || (!run && session?.state === 'working') || outbox.length > 0;
    // How much of the history is on the page, by bytes: tool output makes it a rough guide, which is all it needs to be
    const seen = range && range.size ? Math.round(((range.size - range.start) / range.size) * 100) : 100;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold">{session?.title ?? (info ? 'Session' : <Bone className="h-6 w-56 max-w-full" />)}</h1>
                    <p className="text-sm text-fg-muted">
                        {session?.repo}{session && ', '}
                        {run?.asks.length ? 'Waiting for your answer' : working ? 'Working' : run?.state === 'idle' ? 'Your turn' : session ? SAID[session.state] : info ? '' : 'Loading'}
                    </p>
                </div>
                <div className="flex items-center gap-4 text-sm text-fg-muted">
                    {working && run && <button type="button" disabled={stopping} className={button} onClick={stop}>{stopping ? 'Stopping' : 'Stop'}</button>}
                    <a className="underline-offset-4 hover:text-fg hover:underline" href={resumeHref(id)}>Open in VS Code</a>
                </div>
            </header>

            <div className="relative min-h-0 flex-1">
                <div ref={scroller} onScroll={e => onScroll(e.currentTarget)} className="h-full overflow-y-auto py-4">
                    {range && range.start > 0 && (
                        <p className="pb-4 text-center text-xs text-fg-muted tabular-nums">
                            {older ? <>Loading earlier messages<Dots /></> : <button type="button" onClick={loadOlder} className="underline-offset-4 hover:underline">Load earlier messages</button>}
                            <span className="block pt-1">About {seen}% of the history shown</span>
                        </p>
                    )}
                    {range && range.start === 0 && <p className="pb-4 text-center text-xs text-fg-muted">Start of the session</p>}
                    {!info && !error && <ConversationBones />}
                    <ol className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-3 text-[15px]">
                        {shown.map(e => <Item key={e.id} e={e} fresh={fresh.has(e.id)} result={e.kind === 'tool' ? results.get(e.toolId) : undefined} />)}
                        {outbox.map((t, i) => <li key={`out-${i}`} className="ml-auto max-w-[85%] animate-rise whitespace-pre-wrap wrap-anywhere rounded-2xl bg-surface px-4 py-3 opacity-70">{t}</li>)}
                        {working && <li className="flex items-center text-sm text-fg-muted" aria-live="polite">Working<Dots /></li>}
                    </ol>
                </div>
                {away && (
                    <button type="button" onClick={toBottom} className="absolute bottom-3 left-1/2 flex -translate-x-1/2 animate-rise items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm shadow-lg shadow-black/30 tabular-nums transition-colors hover:border-fg-muted">
                        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M6 13l6 6 6-6" /></svg>
                        {unread ? `${unread} new` : 'Latest'}
                    </button>
                )}
            </div>

            {error && <p role="status" className="mb-2 animate-rise text-sm text-warn">{error}</p>}
            {info?.elsewhere && <p className="mb-2 text-sm text-warn">This session was busy a moment ago, most likely in VS Code. Replying here runs it in two places, which can mix up its messages. Close it in VS Code first.</p>}
            {run?.asks.map(a => <AskCard key={a.key} id={id} ask={a} onDone={() => setRange(r => (r ? { ...r } : r))} onError={setError} />)}
            {info
                ? <Composer id={id}
                    onSending={t => { stick.current = true; setOutbox(o => [...o, t]); }}
                    onSent={() => setInfo(i => (i ? { ...i, run: { state: 'working', asks: i.run?.asks ?? [] } } : i))}
                    onFailed={(t, e) => { setOutbox(o => o.filter(x => x !== t)); setError(e); }} />
                : <div className="flex gap-2 border-t border-line pt-3"><Bone className="h-11 flex-1 rounded-xl" /><Bone className="h-11 w-16 rounded-lg" /></div>}
        </div>
    );
}

/** The shape of a conversation while its first part loads. */
function ConversationBones() {
    return (
        <div role="status" aria-label="Loading the conversation" className="mx-auto grid max-w-3xl gap-4">
            <Bone className="ml-auto h-11 w-2/5 rounded-2xl" />
            <div className="grid gap-2"><Bone className="h-4 w-11/12" /><Bone className="h-4 w-4/5" /><Bone className="h-4 w-2/3" /></div>
            <Bone className="h-9 w-full rounded-xl" />
            <Bone className="h-9 w-full rounded-xl" />
            <div className="grid gap-2"><Bone className="h-4 w-3/4" /><Bone className="h-4 w-1/2" /></div>
        </div>
    );
}

const Chevron = () => (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-fg-muted transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
);

function Item({ e, result, fresh }: { e: Entry; result?: Extract<Entry, { kind: 'result' }>; fresh: boolean }) {
    const rise = fresh ? 'animate-rise' : '';
    if (e.kind === 'you') return <li className={`ml-auto max-w-[85%] whitespace-pre-wrap wrap-anywhere rounded-2xl bg-surface px-4 py-3 ${rise}`}>{e.text}</li>;
    if (e.kind === 'claude') return <li className={`max-w-full ${rise}`}><Markdown text={e.text} /></li>;
    if (e.kind === 'thinking') {
        return (
            <li className={rise}>
                <details className="group text-sm text-fg-muted">
                    <summary className="flex cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden items-center gap-1.5 hover:text-fg"><Chevron />Thinking</summary>
                    <p className="mt-2 whitespace-pre-wrap wrap-break-word border-l border-line pl-3">{e.text}</p>
                </details>
            </li>
        );
    }
    if (e.kind !== 'tool') return null;
    const dot = !result ? 'bg-warn animate-shimmer' : result.error ? 'bg-bad' : 'bg-ok';
    return (
        <li className={rise}>
            <details className="group rounded-xl border border-line text-sm">
                <summary className="flex cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden items-center gap-3 px-3 py-2">
                    <span aria-hidden className={`size-1.5 shrink-0 rounded-full transition-colors ${dot}`} />
                    <span className="shrink-0 font-medium">{e.name}</span>
                    <span className="min-w-0 flex-1 truncate text-fg-muted">{e.summary}</span>
                    <span className="sr-only">{!result ? 'running' : result.error ? 'failed' : 'done'}</span>
                    <Chevron />
                </summary>
                <div className="grid gap-2 border-t border-line px-3 py-2">
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-xs text-fg-muted">{e.input}</pre>
                    {result && <pre className={`max-h-80 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-xs ${result.error ? 'text-bad' : ''}`}>{result.text || '(no output)'}</pre>}
                </div>
            </details>
        </li>
    );
}

/** A permission request (Allow, Allow always, Deny) or questions with their choices, answered here. */
function AskCard({ id, ask, onDone, onError }: { id: string; ask: Ask; onDone: () => void; onError: (e: string) => void }) {
    const [picked, setPicked] = useState<Record<string, string[]>>({});
    const [other, setOther] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string | null>(null); // the button pressed, while its answer goes
    const reply = async (pressed: string, body: object) => {
        setBusy(pressed);
        try { await api(id, { body: { action: 'answer', key: ask.key, ...body } }); onDone(); } catch (e) { onError(message(e)); } finally { setBusy(null); }
    };
    const label = (pressed: string, text: string) => (busy === pressed ? <>{text}<Dots /></> : text);
    if (ask.kind === 'permission') {
        return (
            <div className="mb-3 animate-rise rounded-2xl border border-warn/40 px-4 py-3 text-sm">
                <p><span className="font-medium">Claude wants to use {ask.tool}</span><span className="text-fg-muted"> {ask.summary}</span></p>
                <details className="group mt-1 text-fg-muted"><summary className="flex cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden items-center gap-1.5 hover:text-fg"><Chevron />Details</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-xs">{ask.input}</pre></details>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={Boolean(busy)} className={primary} onClick={() => reply('allow', { allow: true })}>{label('allow', 'Allow')}</button>
                    {ask.canAlways && <button type="button" disabled={Boolean(busy)} className={button} onClick={() => reply('always', { allow: true, always: true })}>{label('always', 'Allow always')}</button>}
                    <button type="button" disabled={Boolean(busy)} className={button} onClick={() => reply('deny', { allow: false })}>{label('deny', 'Deny')}</button>
                </div>
            </div>
        );
    }
    const answers = Object.fromEntries(ask.questions.map(q => [q.question, other[q.question]?.trim() || (picked[q.question] ?? []).join(', ')]));
    const ready = ask.questions.every(q => answers[q.question]);
    return (
        <div className="mb-3 grid animate-rise gap-4 rounded-2xl border border-warn/40 px-4 py-3 text-sm">
            {ask.questions.map(q => (
                <fieldset key={q.question} className="grid gap-2">
                    <legend className="font-medium">{q.question}</legend>
                    <div className="grid gap-2">
                        {q.options.map(o => {
                            const on = (picked[q.question] ?? []).includes(o.label);
                            return (
                                <button key={o.label} type="button" aria-pressed={on}
                                    onClick={() => setPicked(p => ({ ...p, [q.question]: q.multiSelect ? (on ? p[q.question].filter(l => l !== o.label) : [...(p[q.question] ?? []), o.label]) : [o.label] }))}
                                    className={`rounded-xl border px-3 py-2 text-left transition-colors ${on ? 'border-fg bg-surface' : 'border-line hover:border-fg-muted'}`}>
                                    <span className="font-medium">{o.label}</span>
                                    {o.description && <span className="block text-fg-muted">{o.description}</span>}
                                </button>
                            );
                        })}
                        <input value={other[q.question] ?? ''} onChange={e => setOther(o => ({ ...o, [q.question]: e.target.value }))} placeholder="Or write your own answer" aria-label={`Your own answer to: ${q.question}`} className="rounded-xl border border-line bg-transparent px-3 py-2" />
                    </div>
                </fieldset>
            ))}
            <div className="flex flex-wrap gap-2">
                <button type="button" disabled={Boolean(busy) || !ready} className={primary} onClick={() => reply('send', { allow: true, answers })}>{label('send', 'Send answers')}</button>
                <button type="button" disabled={Boolean(busy)} className={button} onClick={() => reply('skip', { allow: false, note: 'The owner skipped these questions' })}>{label('skip', 'Skip')}</button>
            </div>
        </div>
    );
}

const draftKey = (id: string) => `lighthouse.draft.${id}`;
const readDraft = (id: string) => { try { return localStorage.getItem(draftKey(id)) ?? ''; } catch { return ''; } };
const saveDraft = (id: string, text: string) => { try { if (text) localStorage.setItem(draftKey(id), text); else localStorage.removeItem(draftKey(id)); } catch { /* private window: no draft kept */ } };

/**
 * The reply box: Enter sends, Shift+Enter makes a new line. Only ever rendered in the browser (after the first load),
 * so it can start from the draft you left in this session and take the focus on a computer.
 */
function Composer({ id, onSending, onSent, onFailed }: { id: string; onSending: (t: string) => void; onSent: () => void; onFailed: (t: string, e: string) => void }) {
    const [text, setText] = useState(() => readDraft(id));
    const [busy, setBusy] = useState(false);
    const [focus] = useState(() => window.matchMedia('(pointer: fine)').matches); // a phone's keyboard shouldn't pop up by itself
    const change = (t: string) => { setText(t); saveDraft(id, t); };
    const sendIt = async () => {
        const t = text.trim();
        if (!t || busy) return;
        setBusy(true);
        onSending(t); change('');
        try { await api(id, { body: { action: 'send', text: t } }); onSent(); } catch (e) { change(text); onFailed(t, message(e)); } finally { setBusy(false); }
    };
    return (
        <form onSubmit={e => { e.preventDefault(); void sendIt(); }} className="flex items-end gap-2 border-t border-line pt-3">
            <textarea
                autoFocus={focus}
                value={text}
                onChange={e => change(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendIt(); } }}
                rows={Math.min(8, Math.max(1, text.split('\n').length))}
                placeholder="Reply to Claude"
                aria-label="Reply to Claude"
                className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-fg transition-colors placeholder:text-fg-muted focus:border-fg-muted"
            />
            <button type="submit" disabled={busy || !text.trim()} className={`${primary} h-11 px-4`}>Send</button>
        </form>
    );
}
