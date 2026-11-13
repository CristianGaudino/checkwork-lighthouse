import type { Analytics as Data } from '@/lib/cloudflare';
import { siteKey } from '@/lib/cloudflare';
import type { NeonUsage } from '@/lib/neon';
import { ago } from '@/lib/today';
import { cell, num, panel, Problem, Section, Setup } from './ui';

const pct = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 1 });

type Row = { name: string; site: string; worker: string | null };

/** Visits (Web Analytics, 7 days) and Worker health (24 hours) per site. A dash means no data, often Web Analytics not on yet. */
export function Analytics({ rows, data, problem, setup }: { rows: Row[]; data?: Data; problem?: string; setup?: string }) {
    return (
        <Section id="traffic" title="Traffic" aside="Visits 7 days, requests 24 hours">
            {setup && <Setup>{setup}</Setup>}
            {problem ? <Problem>{problem}</Problem> : data && (
                // relative: keeps a scrolled table's sr-only bits inside its box instead of widening the page
                <div className="relative mt-3 overflow-x-auto rounded-2xl border border-line">
                    <table className="w-full whitespace-nowrap text-left text-sm tabular-nums">
                        <thead className="text-xs text-fg-muted">
                            <tr className="border-b border-line">
                                {['Site', 'Visits', 'Page views', 'Top page', 'Requests', 'Errors', 'CPU p99'].map(h => <th key={h} scope="col" className={`${cell} font-normal`}>{h}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {rows.map(r => {
                                const t = data.traffic.get(siteKey(r.site));
                                const w = r.worker ? data.workers.get(r.worker) : undefined;
                                const rate = w && w.requests ? w.errors / w.requests : 0;
                                return (
                                    <tr key={r.name}>
                                        <th scope="row" className={`${cell} font-medium`}>{r.name}</th>
                                        <td className={cell}>{t ? num.format(t.visits) : '–'}</td>
                                        <td className={cell}>{t ? num.format(t.views) : '–'}</td>
                                        <td className={`${cell} max-w-56 truncate text-fg-muted`}>{t?.topPaths[0]?.path ?? '–'}</td>
                                        <td className={cell}>{w ? num.format(w.requests) : '–'}</td>
                                        <td className={`${cell} ${rate > 0.01 ? 'text-bad' : 'text-fg-muted'}`}>{w ? `${num.format(w.errors)} (${pct.format(rate)})` : '–'}</td>
                                        <td className={`${cell} text-fg-muted`}>{w?.cpuP99 != null ? `${num.format(Math.round(w.cpuP99))} ms` : '–'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Section>
    );
}

const size = (bytes: number) => `${num.format(Math.round(bytes / 1_048_576))} MB`;

/** Neon usage this billing period, for the projects that use it. */
export function Neon({ projects, problem, setup }: { projects?: NeonUsage[]; problem?: string; setup?: string }) {
    return (
        <Section id="neon" title="Neon" aside="This billing period">
            {setup && <Setup>{setup}</Setup>}
            {problem ? <Problem>{problem}</Problem> : projects && (
                <ul className={`${panel} text-sm tabular-nums`}>
                    {projects.map(p => (
                        <li key={p.id} className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(10rem,14rem)_1fr]">
                            <span className="font-medium">{p.name}</span>
                            <span className="text-fg-muted">
                                {[
                                    p.computeHours !== null && `${num.format(p.computeHours)} compute hours`,
                                    p.storageBytes !== null && `${size(p.storageBytes)} stored`,
                                    p.lastActive && `active ${ago(p.lastActive)}`,
                                ].filter(Boolean).join(', ') || 'No figures returned'}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
}
