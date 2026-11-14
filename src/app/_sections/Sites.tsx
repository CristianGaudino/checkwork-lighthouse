import Link from 'next/link';
import type { Analytics } from '@/lib/cloudflare';
import { siteKey } from '@/lib/cloudflare';
import type { LiveState } from '@/lib/live';
import { span, type Light, type ProjectState } from '@/lib/today';
import type { Uptime } from '@/lib/uptime';
import { ProjectIcon } from './ProjectIcon';
import { Dot, n, num } from './ui';

const STATE: Record<Uptime['state'], string> = { up: 'Up', down: 'Down', paused: 'Paused', unknown: 'Checking' };

export function uptimeText(u: Uptime | null | undefined) {
    if (u === undefined) return '–';
    if (!u) return 'No monitor';
    return u.seconds === null || u.state === 'paused' || u.state === 'unknown' ? STATE[u.state] : `${STATE[u.state]} ${span(u.seconds)}`;
}

export function liveText(l: LiveState | null) {
    if (!l) return '–';
    return l.state === 'live' ? 'Live' : l.state === 'deploying' ? 'Deploying' : l.label;
}

/** Visits per day for the week, today last and brighter. Scaled to the site's own busiest day, so its shape reads at any size. */
export function Week({ days }: { days: number[] }) {
    const top = Math.max(1, ...days);
    return (
        <svg viewBox="0 0 48 16" className="h-4 w-12 shrink-0" aria-hidden>
            {days.map((v, i) => {
                const h = v ? Math.max(2, (v / top) * 16) : 1;
                return <rect key={i} x={i * 7} y={16 - h} width="5" height={h} rx="1" className={i === days.length - 1 ? 'fill-fg' : 'fill-fg-muted/45'} />;
            })}
        </svg>
    );
}

export type SiteRow = { p: ProjectState; live: LiveState | null; worker: string | null; light: Light };

const COLS = 'sm:grid-cols-[minmax(11rem,1.3fr)_minmax(7rem,1fr)_minmax(8rem,1fr)_3.5rem_minmax(7rem,1fr)_4.5rem]';

/**
 * Every site in one panel, a row each, worst news in its own colour. A row opens the project's page.
 * `known`: GitHub answered, so the lights mean something.
 */
export function Sites({ rows, analytics, known }: { rows: SiteRow[]; analytics?: Analytics; known: boolean }) {
    return (
        <div className="mt-3 rounded-2xl border border-line text-sm tabular-nums">
            <div className={`hidden gap-4 border-b border-line px-4 py-2 text-xs text-fg-muted sm:grid ${COLS}`} aria-hidden>
                <span>Site</span><span>Uptime</span><span>Running</span><span className="text-right">PRs</span><span>Visits, 7 days</span><span className="text-right">Errors</span>
            </div>
            <ul className="divide-y divide-line">
                {rows.map(({ p, live, worker, light }) => {
                    const t = analytics?.traffic.get(siteKey(p.site));
                    const w = worker ? analytics?.workers.get(worker) : undefined;
                    const rate = w?.requests ? w.errors / w.requests : 0;
                    const prs = p.repoStatus?.prs.filter(pr => !pr.draft).length;
                    const down = p.uptime?.state === 'down';
                    return (
                        <li key={p.repo}>
                            <Link href={`/projects/${p.repo}`} className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-surface/60 active:bg-surface ${COLS}`}>
                                <span className="flex min-w-0 items-center gap-3">
                                    <Dot light={known ? light : null} />
                                    <ProjectIcon project={p.repo} />
                                    <span className="truncate text-[15px] font-medium">{p.name}</span>
                                </span>
                                <span className={down ? 'text-bad' : 'text-fg-muted'}>{uptimeText(p.uptime)}</span>
                                <span className={`hidden sm:block ${live?.state === 'behind' ? 'text-warn' : 'text-fg-muted'}`}>{liveText(live)}</span>
                                {/* On a phone the rest rides along on one line under the name */}
                                <span className="col-span-2 pl-13 text-fg-muted empty:hidden sm:hidden">
                                    {[live && <span key="l" className={live.state === 'behind' ? 'text-warn' : ''}>{liveText(live)}</span>, prs ? n(prs, 'PR') : null, t ? n(t.visits, 'visit') : null]
                                        .filter(Boolean).flatMap((part, i) => (i ? [', ', part] : [part]))}
                                </span>
                                <span className="hidden text-right text-fg-muted sm:block">{prs || '–'}</span>
                                <span className="hidden items-center gap-3 text-fg-muted sm:flex">{t ? <><Week days={t.days} />{num.format(t.visits)}</> : '–'}</span>
                                <span className={`hidden text-right sm:block ${rate > 0.01 ? 'text-bad' : 'text-fg-muted'}`}>{w ? num.format(w.errors) : '–'}</span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
