'use client';

import { useActionState } from 'react';
import type { AskResult } from '@/lib/ask';

/**
 * A button that runs one Claude call and shows the answer below it. Nothing runs until it is pressed, and pressing again
 * asks again (each press is one paid call).
 */
export function Ask({ action, label, note, fields }: {
    action: (prev: AskResult, form: FormData) => Promise<AskResult>;
    label: string;
    note: string;
    fields?: Record<string, string>;
}) {
    const [state, run, pending] = useActionState(action, {});
    return (
        <form action={run} className="mt-3">
            {Object.entries(fields ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <button type="submit" disabled={pending} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-fg-muted disabled:opacity-60">
                    {pending ? 'Asking Claude' : state.text ? `${label} again` : label}
                </button>
                <span className="text-sm text-fg-muted">{note}</span>
            </div>
            <div aria-live="polite">
                {state.error && <p className="mt-3 text-sm text-warn">{state.error}</p>}
                {state.text && <p className="mt-3 max-w-3xl whitespace-pre-wrap rounded-xl border border-line bg-surface p-4 text-sm leading-6">{state.text}</p>}
            </div>
        </form>
    );
}
