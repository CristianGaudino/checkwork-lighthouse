import type { Analytics as Data } from '@/lib/cloudflare';
import { siteKey } from '@/lib/cloudflare';
import type { NeonUsage } from '@/lib/neon';
import { ago } from '@/lib/today';
import { cell, Heading, Problem, Setup } from './ui';

const num = new Intl.NumberFormat('en-IE');
const pct = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 1 });

type Row = { name: string; site: string; worker: string | null };

/** Traffic (Web Analytics, 7 days) and Worker health (24 hours) per site. A site without Web Analytics shows a dash. */
export function Analytics({ rows, data, problem, setup }: { rows: Row[]; data?: Data; problem?: string; setup?: string }) {
    return (
        <section>
            <Heading id="traffic">Traffic and Workers</Heading>
            {setup && <Setup>{setup}</Setup>}
            {problem ? <Problem>{problem}</Problem> : data && (
                <>
                    <p className="mt-1 text-sm text-fg-muted">Visits and page views over 7 days from Web Analytics; Worker requests over 24 hours. A dash means no data, often Web Analytics not switched on yet.</p>
                    <div className="relative mt-4 overflow-x-auto border-y border-line">
                        <table className="w-full whitespace-nowrap text-left text-sm tabular-nums">
                            <thead className="text-fg-muted">
                                <tr className="border-b border-line">
                                    {['Project', 'Visits', 'Page views', 'Top page', 'Requests', 'Errors', 'CPU p99'].map(h => <th key={h} scope="col" className={`${cell} font-medium`}>{h}</th>)}
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
                </>
            )}
        </section>
    );
}

const size = (bytes: number) => `${num.format(Math.round(bytes / 1_048_576))} MB`;

/** Neon usage this billing period. Shown only when NEON_API_KEY is set: only some projects use Neon. */
export function Neon({ projects, problem, setup }: { projects?: NeonUsage[]; problem?: string; setup?: string }) {
    return (
        <section>
            <Heading id="neon">Neon</Heading>
            {setup && <Setup>{setup}</Setup>}
            {problem ? <Problem>{problem}</Problem> : projects && (
                <ul className="mt-4 divide-y divide-line border-y border-line text-sm tabular-nums">
                    {projects.map(p => (
                        <li key={p.id} className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[minmax(10rem,14rem)_1fr]">
                            <span className="text-base font-medium">{p.name}</span>
                            <span className="text-fg-muted">
                                {[
                                    p.computeHours !== null && `${num.format(p.computeHours)} compute hours this period`,
                                    p.storageBytes !== null && `${size(p.storageBytes)} stored`,
                                    p.lastActive && `last active ${ago(p.lastActive)}`,
                                ].filter(Boolean).join(', ') || 'No usage figures returned'}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
