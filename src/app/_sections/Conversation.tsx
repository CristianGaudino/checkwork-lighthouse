'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Session } from '@/lib/claude';
import type { Ask, RunView } from '@/lib/runner';
import type { Entry } from '@/lib/transcript';
import { resumeHref } from '@/lib/vscode';
import { Markdown } from './Markdown';

/**
 * One Claude Code session, used from Lighthouse: its whole history (older parts load as you scroll up), what it is
 * doing now, its questions and permission requests to answer, and a box to reply. Polls the session's transcript:
 * quickly while it works, slowly while it waits.
 */

type Slice = { entries: Entry[]; start: number; end: number; reset?: boolean; session: Session | null; run: RunView | null; elsewhere: boolean };

const FAST = 1500, SLOW = 5000;
const NEAR = 120; // px from an edge that counts as "at" it

const SAID: Record<Session['state'], string> = {
    question: 'Asking you something', blocked: 'Waiting for your OK, or on a long step', waiting: 'Your turn', working: 'Working', stopped: 'Stopped mid-task',
};

const button = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-fg-muted disabled:opacity-60';
const primary = 'rounded-lg bg-fg px-3 py-1.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-50';

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
    const [range, setRange] = useState<{ start: number; end: number } | null>(null);
    const [info, setInfo] = useState<Pick<Slice, 'session' | 'run' | 'elsewhere'> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [older, setOlder] = useState(false);
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
                setEntries(s.entries); setRange({ start: s.start, end: s.end }); setInfo(s); setError(null);
            },
            e => { if (current) setError(e instanceof Error ? e.message : String(e)); },
        );
        return () => { current = false; };
    }, [id, round]);

    // New lines while it runs: quickly when something is happening, slowly otherwise, never in a hidden tab
    const busy = info?.run?.state === 'working' || info?.session?.state === 'working' || info?.session?.state === 'blocked' || Boolean(info?.run?.asks.length);
    useEffect(() => {
        if (!range) return;
        const timer = setTimeout(async () => {
            if (document.visibilityState !== 'visible') { setRange(r => (r ? { ...r } : r)); return; }
            try {
                const s = (await api(id, { query: `after=${range.end}` })) as Slice;
                if (s.reset) { load(); return; }
                const el = scroller.current;
                stick.current = !el || el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
                if (s.entries.length) setEntries(es => [...es, ...s.entries]);
                setRange(r => (r ? { start: r.start, end: s.end } : r));
                setInfo(s); setError(null);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setRange(r => (r ? { ...r } : r)); // try again next round
            }
        }, busy ? FAST : SLOW);
        return () => clearTimeout(timer);
    }, [id, range, busy, load]);

    const loadOlder = useCallback(async () => {
        if (!range || range.start === 0 || older) return;
        setOlder(true);
        try {
            const s = (await api(id, { query: `before=${range.start}` })) as Slice;
            keep.current = scroller.current?.scrollHeight ?? null;
            setEntries(es => [...s.entries, ...es]);
            setRange(r => (r ? { start: s.start, end: r.end } : r));
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setOlder(false); }
    }, [id, range, older]);

    // Keep the view still when older messages go in above, and at the bottom when new ones arrive
    useLayoutEffect(() => {
        const el = scroller.current;
        if (!el) return;
        if (keep.current !== null) { el.scrollTop += el.scrollHeight - keep.current; keep.current = null; } else if (stick.current) el.scrollTop = el.scrollHeight;
    }, [entries]);

    const results = new Map(entries.flatMap(e => (e.kind === 'result' ? [[e.toolId, e] as const] : [])));
    const shown = entries.filter(e => e.kind !== 'result');
    const run = info?.run, session = info?.session;
    const working = run?.state === 'working' || (!run && session?.state === 'working');

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold">{session?.title ?? 'Session'}</h1>
                    <p className="text-sm text-fg-muted">
                        {session?.repo}{session && ', '}
                        {run?.asks.length ? 'Waiting for your answer' : working ? 'Working' : run?.state === 'idle' ? 'Your turn' : session ? SAID[session.state] : 'Loading'}
                    </p>
                </div>
                <div className="flex items-center gap-4 text-sm text-fg-muted">
                    {working && run && <button type="button" className={button} onClick={() => api(id, { body: { action: 'stop' } }).catch(e => setError(String(e)))}>Stop</button>}
                    <a className="underline-offset-4 hover:text-fg hover:underline" href={resumeHref(id)}>Open in VS Code</a>
                </div>
            </header>

            <div ref={scroller} onScroll={e => { if (e.currentTarget.scrollTop < NEAR) void loadOlder(); }} className="min-h-0 flex-1 overflow-y-auto py-4">
                {range && range.start > 0 && <p className="pb-4 text-center text-xs text-fg-muted">{older ? 'Loading earlier messages' : <button type="button" onClick={loadOlder} className="underline-offset-4 hover:underline">Load earlier messages</button>}</p>}
                {range && range.start === 0 && <p className="pb-4 text-center text-xs text-fg-muted">Start of the session</p>}
                <ol className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-3 text-[15px]">
                    {shown.map(e => <Item key={e.id} e={e} result={e.kind === 'tool' ? results.get(e.toolId) : undefined} />)}
                    {working && <li className="text-sm text-fg-muted" aria-live="polite">Working</li>}
                </ol>
            </div>

            {error && <p role="status" className="mb-2 text-sm text-warn">{error}</p>}
            {info?.elsewhere && <p className="mb-2 text-sm text-warn">This session was busy a moment ago, most likely in VS Code. Replying here runs it in two places, which can mix up its messages. Close it in VS Code first.</p>}
            {run?.asks.map(a => <AskCard key={a.key} id={id} ask={a} onDone={() => setRange(r => (r ? { ...r } : r))} onError={setError} />)}
            <Composer id={id} disabled={!info} onSent={() => setInfo(i => (i ? { ...i, run: { state: 'working', asks: i.run?.asks ?? [] } } : i))} onError={setError} />
        </div>
    );
}

function Item({ e, result }: { e: Entry; result?: Extract<Entry, { kind: 'result' }> }) {
    if (e.kind === 'you') return <li className="ml-auto max-w-[85%] whitespace-pre-wrap wrap-anywhere rounded-2xl bg-surface px-4 py-3">{e.text}</li>;
    if (e.kind === 'claude') return <li className="max-w-full"><Markdown text={e.text} /></li>;
    if (e.kind === 'thinking') {
        return (
            <li>
                <details className="text-sm text-fg-muted">
                    <summary className="cursor-pointer select-none hover:text-fg">Thinking</summary>
                    <p className="mt-2 whitespace-pre-wrap wrap-break-word border-l border-line pl-3">{e.text}</p>
                </details>
            </li>
        );
    }
    if (e.kind !== 'tool') return null;
    const dot = !result ? 'bg-warn' : result.error ? 'bg-bad' : 'bg-ok';
    return (
        <li>
            <details className="group rounded-xl border border-line text-sm">
                <summary className="flex cursor-pointer select-none items-center gap-3 px-3 py-2">
                    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dot}`} />
                    <span className="shrink-0 font-medium">{e.name}</span>
                    <span className="min-w-0 truncate text-fg-muted">{e.summary}</span>
                    <span className="sr-only">{!result ? 'running' : result.error ? 'failed' : 'done'}</span>
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
    const [busy, setBusy] = useState(false);
    const reply = async (body: object) => {
        setBusy(true);
        try { await api(id, { body: { action: 'answer', key: ask.key, ...body } }); onDone(); } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
    };
    if (ask.kind === 'permission') {
        return (
            <div className="mb-3 rounded-2xl border border-warn/40 px-4 py-3 text-sm">
                <p><span className="font-medium">Claude wants to use {ask.tool}</span><span className="text-fg-muted"> {ask.summary}</span></p>
                <details className="mt-1 text-fg-muted"><summary className="cursor-pointer select-none hover:text-fg">Details</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap wrap-break-word font-mono text-xs">{ask.input}</pre></details>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={busy} className={primary} onClick={() => reply({ allow: true })}>Allow</button>
                    {ask.canAlways && <button type="button" disabled={busy} className={button} onClick={() => reply({ allow: true, always: true })}>Allow always</button>}
                    <button type="button" disabled={busy} className={button} onClick={() => reply({ allow: false })}>Deny</button>
                </div>
            </div>
        );
    }
    const answers = Object.fromEntries(ask.questions.map(q => [q.question, other[q.question]?.trim() || (picked[q.question] ?? []).join(', ')]));
    const ready = ask.questions.every(q => answers[q.question]);
    return (
        <div className="mb-3 grid gap-4 rounded-2xl border border-warn/40 px-4 py-3 text-sm">
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
                <button type="button" disabled={busy || !ready} className={primary} onClick={() => reply({ allow: true, answers })}>Send answers</button>
                <button type="button" disabled={busy} className={button} onClick={() => reply({ allow: false, note: 'The owner skipped these questions' })}>Skip</button>
            </div>
        </div>
    );
}

/** The reply box: Enter sends, Shift+Enter makes a new line. */
function Composer({ id, disabled, onSent, onError }: { id: string; disabled: boolean; onSent: () => void; onError: (e: string) => void }) {
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const sendIt = async () => {
        if (!text.trim() || busy) return;
        setBusy(true);
        try { await api(id, { body: { action: 'send', text } }); setText(''); onSent(); } catch (e) { onError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
    };
    return (
        <form onSubmit={e => { e.preventDefault(); void sendIt(); }} className="flex items-end gap-2 border-t border-line pt-3">
            <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendIt(); } }}
                rows={Math.min(8, Math.max(1, text.split('\n').length))}
                placeholder="Reply to Claude"
                aria-label="Reply to Claude"
                disabled={disabled}
                className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] text-fg placeholder:text-fg-muted"
            />
            <button type="submit" disabled={disabled || busy || !text.trim()} className={`${primary} h-11 px-4`}>{busy ? 'Sending' : 'Send'}</button>
        </form>
    );
}
