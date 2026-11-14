'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Start a Claude Code session in one of this PC's repos, from here. It opens as soon as Claude has picked it up. */
export function NewSession({ repos }: { repos: string[] }) {
    const router = useRouter();
    const [repo, setRepo] = useState('checkwork-lighthouse');
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg';
    return (
        <details className="rounded-xl border border-line text-sm">
            <summary className="cursor-pointer select-none px-3 py-2 font-medium">New session</summary>
            <form
                className="grid gap-2 border-t border-line p-3"
                onSubmit={async e => {
                    e.preventDefault();
                    setBusy(true); setError(null);
                    try {
                        const res = await fetch('/api/claude', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ repo, text }) });
                        const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
                        if (!res.ok || !json.id) throw new Error(json.error ?? 'Claude did not start.');
                        router.push(`/claude/${json.id}`);
                    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
                }}
            >
                <select value={repo} onChange={e => setRepo(e.target.value)} aria-label="Repo" className={field}>
                    {repos.map(r => <option key={r}>{r}</option>)}
                </select>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="What should Claude do?" aria-label="First message" className={field} />
                <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-fg px-3 py-1.5 font-medium text-canvas disabled:opacity-50">{busy ? 'Starting' : 'Start'}</button>
                {error && <p role="status" className="text-warn">{error}</p>}
            </form>
        </details>
    );
}
