'use client';

import { useActionState } from 'react';
import type { ActResult } from '@/lib/act';
import { ISSUE_TYPES } from '@/lib/act';

type Action = (prev: ActResult, form: FormData) => Promise<ActResult>;
const button = 'rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-fg-muted disabled:opacity-60';

function Result({ state }: { state: ActResult }) {
    if (state.error) return <span className="text-sm text-warn">{state.error}</span>;
    if (state.ok) return <span className="text-sm text-ok">{state.href ? <a href={state.href} target="_blank" rel="noreferrer" className="underline underline-offset-4">{state.ok}</a> : state.ok}</span>;
    return null;
}

/** One button that changes something on GitHub. `confirm` asks first with the phone's own dialog, for anything hard to undo. */
export function ActButton({ action, label, fields, confirm }: { action: Action; label: string; fields: Record<string, string>; confirm?: string }) {
    const [state, run, pending] = useActionState(action, {});
    return (
        <form action={run} onSubmit={e => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            {!state.ok && <button type="submit" disabled={pending} className={button}>{pending ? 'Working' : label}</button>}
            <span aria-live="polite"><Result state={state} /></span>
        </form>
    );
}

/** Quick capture: a new issue in any project, from a phone. `start`: filled in from a task's File an issue link, and opened. */
export function NewIssue({ action, repos, start }: { action: Action; repos: { repo: string; name: string }[]; start?: { repo?: string; title?: string; body?: string } }) {
    const [state, run, pending] = useActionState(action, {});
    const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg';
    return (
        <details id="new-issue" className="mt-6 scroll-mt-6" open={Boolean(start?.title)}>
            <summary className="cursor-pointer text-sm font-medium text-fg-muted hover:text-fg">New issue</summary>
            <form action={run} className="mt-3 grid max-w-2xl gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm text-fg-muted">Project
                        <select name="repo" required className={field} defaultValue={start?.repo ?? ''}>
                            <option value="" disabled>Pick one</option>
                            {repos.map(r => <option key={r.repo} value={r.repo}>{r.name}</option>)}
                        </select>
                    </label>
                    <label className="grid gap-1 text-sm text-fg-muted">Type
                        <select name="type" className={field} defaultValue="Task">
                            {ISSUE_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                    </label>
                </div>
                <label className="grid gap-1 text-sm text-fg-muted">Title
                    <input name="title" required maxLength={256} className={field} defaultValue={start?.title} />
                </label>
                <label className="grid gap-1 text-sm text-fg-muted">Details
                    <textarea name="body" rows={3} className={field} defaultValue={start?.body} />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" disabled={pending} className={button}>{pending ? 'Opening' : 'Open issue'}</button>
                    <span aria-live="polite"><Result state={state} /></span>
                </div>
            </form>
        </details>
    );
}
