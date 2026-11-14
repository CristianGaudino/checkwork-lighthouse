'use client';

import { useState } from 'react';
import { resumeHref } from '@/lib/vscode';

/**
 * Write a reply here, then open the session in VS Code with it typed in; you send it there. Lighthouse never sends
 * anything to Claude itself (CLAUDE.md).
 */
export function Reply({ id }: { id: string }) {
    const [text, setText] = useState('');
    return (
        <details className="group w-full sm:w-auto">
            <summary className="cursor-pointer list-none underline-offset-4 hover:text-fg hover:underline">Reply</summary>
            <div className="mt-2 grid gap-2 sm:w-80">
                <textarea value={text} onChange={e => setText(e.target.value)} rows={3} aria-label="Reply" className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg" />
                <a
                    href={text.trim() ? resumeHref(id, text.trim()) : resumeHref(id)}
                    className="w-fit rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:border-fg-muted"
                >
                    Open in VS Code with this
                </a>
                <p className="text-xs text-fg-muted">You press Enter there. If the session is already open in VS Code, it only comes to the front.</p>
            </div>
        </details>
    );
}
