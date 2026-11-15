import type { Failure } from '@/lib/failure';
import { ext, link } from './ui';

/** Why the checks failed: the job and step, GitHub's error notes, and the end of the log folded away. */
export function FailureDetail({ failure: f }: { failure: Failure }) {
    return (
        <div className="grid min-w-0 gap-1 text-sm">
            <p className="text-fg-muted">
                Failed at <span className="text-fg">{f.step ?? f.job}</span>{f.step && <> in {f.job}</>}, {f.workflow}. <a {...ext} className={link} href={f.href}>Job on GitHub</a>
            </p>
            {f.notes.map(n => <p key={n} className="break-words font-mono text-xs text-bad">{n}</p>)}
            {f.log.length > 0 && (
                <details className="min-w-0">
                    <summary className="cursor-pointer select-none text-fg-muted hover:text-fg">End of the log</summary>
                    <pre className="mt-2 max-h-80 overflow-auto overscroll-contain rounded-lg border border-line bg-surface p-3 font-mono text-xs leading-relaxed">{f.log.join('\n')}</pre>
                </details>
            )}
        </div>
    );
}
