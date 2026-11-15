'use client';

import { useState } from 'react';

/** Copies `text`, and says so for a moment. */
export function Copy({ text, className = '' }: { text: string; className?: string }) {
    const [done, setDone] = useState(false);
    return (
        <button
            type="button"
            onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => undefined)}
            className={`rounded-md px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-canvas hover:text-fg ${className}`}
        >
            <span aria-live="polite">{done ? 'Copied' : 'Copy'}</span>
        </button>
    );
}
