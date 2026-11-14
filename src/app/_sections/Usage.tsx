import type { RepoStatus } from '@/lib/github';
import { buildDrift } from '@/lib/drift';
import { INCLUDED, type Minutes as Data } from '@/lib/minutes';
import { PROJECTS } from '../../../lighthouse.config';
import { cell, ext, link, num, Section } from './ui';

const day = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * The shared Actions allowance: one bar for the month (the accent, amber when on pace to go over), then each repo's share.
 * `compact` (the Overview): the bar alone.
 */
export function Minutes({ m, compact }: { m: Data; compact?: boolean }) {
    const pct = (x: number) => `${Math.min(100, (x / INCLUDED) * 100)}%`;
    const over = m.projected > INCLUDED;
    const lastDay = new Date(m.monthEnd.getTime() - 86_400_000);
    const top = Math.max(...m.byRepo.map(r => r.minutes));
    return (
        <Section id="minutes" title="Actions minutes" aside={`${num.format(m.used)} of ${num.format(INCLUDED)}`}>
            <div className="relative mt-3 h-2 rounded-full bg-surface" role="img" aria-label={`${num.format(m.used)} of ${num.format(INCLUDED)} minutes used, on pace for ${num.format(m.projected)}`}>
                {/* The projection sits behind the used bar as a faint extension */}
                <div className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-warn/30' : 'bg-accent/30'}`} style={{ width: pct(m.projected) }} />
                <div className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-warn' : 'bg-accent'}`} style={{ width: pct(m.used) }} />
            </div>
            <p className="mt-2 text-sm text-fg-muted tabular-nums">
                On pace for <span className={over ? 'text-warn' : 'text-fg'}>{num.format(m.projected)}</span> by {day.format(lastDay)}. Public repos are free.
            </p>
            {!compact && m.byRepo.length > 0 && (
                <ul className="mt-4 grid gap-2 text-sm tabular-nums">
                    {m.byRepo.map(r => (
                        <li key={r.repo} className={`grid grid-cols-[minmax(7rem,12rem)_1fr_6rem] items-center gap-4 ${r.free ? 'text-fg-muted' : ''}`}>
                            <span className="truncate">{r.repo}</span>
                            <span className={`h-1 rounded-full ${r.free ? 'bg-fg-muted/15' : 'bg-fg-muted/40'}`} style={{ width: `${(r.minutes / top) * 100}%` }} />
                            <span className="text-right text-fg-muted">{r.free ? `${num.format(r.minutes)}, free` : num.format(r.minutes)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
}

/** Declared versions per repo; amber where a repo asks for less than the newest any repo uses. `only`: one repo's row. */
export function Versions({ repos, only }: { repos: RepoStatus[]; only?: string }) {
    const { labels, newest, rows: all } = buildDrift(PROJECTS, repos);
    const rows = all.filter(r => !only || r.repo === only);
    if (!rows.length) return null;
    return (
        <Section id="versions" title="Versions" aside="Amber is behind the newest in use">
            <div className="relative mt-3 overflow-x-auto rounded-2xl border border-line">
                <table className="w-full whitespace-nowrap text-left text-sm tabular-nums">
                    <thead className="text-xs text-fg-muted">
                        <tr className="border-b border-line">
                            <th scope="col" className={`${cell} align-top font-normal`}>Project</th>
                            {labels.map(l => (
                                <th key={l} scope="col" className={`${cell} align-top font-normal`}>{l}<span className="block text-fg">{newest[l]}</span></th>
                            ))}
                            <th scope="col" className={cell}><span className="sr-only">Issue</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {rows.map(r => (
                            <tr key={r.repo}>
                                <th scope="row" className={`${cell} font-medium`}>{r.project}</th>
                                {labels.map(l => {
                                    const c = r.cells[l];
                                    return <td key={l} className={`${cell} ${c?.behind ? 'text-warn' : 'text-fg-muted'}`}>{c ? c.spec : ''}</td>;
                                })}
                                <td className={`${cell} text-right`}>
                                    {r.issueHref && <a {...ext} className={`${link} text-fg-muted`} href={r.issueHref}>File issue</a>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Section>
    );
}
