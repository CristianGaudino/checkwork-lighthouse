import { z } from 'zod';

/**
 * Traffic and Worker health per site from Cloudflare's GraphQL Analytics API (one request): visits and page views from
 * Web Analytics over 7 days, and Worker requests, errors and CPU over 24 hours. The token needs Account Analytics: Read.
 */

/** `days`: visits per UTC day, the oldest of the 7 first. */
export type SiteTraffic = { visits: number; views: number; days: number[]; topPaths: { path: string; views: number }[] };
/** `cpuP99` in milliseconds. */
export type WorkerHealth = { requests: number; errors: number; cpuP99: number | null };
export type Analytics = { traffic: Map<string, SiteTraffic>; workers: Map<string, WorkerHealth> };

const Data = z.object({
    viewer: z.object({
        accounts: z.array(z.object({
            hosts: z.array(z.object({ count: z.number(), sum: z.object({ visits: z.number() }), dimensions: z.object({ requestHost: z.string(), date: z.string().optional() }) })).default([]),
            paths: z.array(z.object({ count: z.number(), dimensions: z.object({ requestHost: z.string(), requestPath: z.string() }) })).default([]),
            workers: z.array(z.object({
                sum: z.object({ requests: z.number(), errors: z.number() }),
                quantiles: z.object({ cpuTimeP99: z.number().nullable().optional() }).optional(),
                dimensions: z.object({ scriptName: z.string() }),
            })).default([]),
        })),
    }),
});

const QUERY = `query ($account: String!, $week: Time!, $day: Time!, $now: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    hosts: rumPageloadEventsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $week, datetime_leq: $now }) {
      count sum { visits } dimensions { requestHost date }
    }
    paths: rumPageloadEventsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $week, datetime_leq: $now }, orderBy: [count_DESC]) {
      count dimensions { requestHost requestPath }
    }
    workers: workersInvocationsAdaptive(limit: 100, filter: { datetime_geq: $day, datetime_leq: $now }) {
      sum { requests errors } quantiles { cpuTimeP99 } dimensions { scriptName }
    }
  } }
}`;

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '');

/** Groups the raw rows by site (with or without www) and Worker. Separate from the fetch so it can be tested. */
export function summarise(raw: unknown, now = new Date()): Analytics {
    const account = Data.parse(raw).viewer.accounts[0];
    const traffic = new Map<string, SiteTraffic>();
    // The 7 UTC dates the bars stand for, oldest first; today is the last
    const dates = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() - (6 - i) * 86_400_000).toISOString().slice(0, 10));
    // Totals come from one row per site and day, so a quiet site is never crowded out by a busy site's many pages
    for (const h of account?.hosts ?? []) {
        const host = bare(h.dimensions.requestHost);
        const t = traffic.get(host) ?? { visits: 0, views: 0, days: dates.map(() => 0), topPaths: [] };
        t.visits += h.sum.visits;
        t.views += h.count;
        const day = h.dimensions.date ? dates.indexOf(h.dimensions.date) : -1;
        if (day >= 0) t.days[day] += h.sum.visits;
        traffic.set(host, t);
    }
    // shortcut: top pages come from the busiest 1,000 site-and-path rows, so a quiet site's top page can be missing while its totals are right
    for (const r of account?.paths ?? []) {
        const t = traffic.get(bare(r.dimensions.requestHost));
        if (!t) continue;
        const path = t.topPaths.find(p => p.path === r.dimensions.requestPath);
        if (path) path.views += r.count; else t.topPaths.push({ path: r.dimensions.requestPath, views: r.count });
    }
    for (const t of traffic.values()) t.topPaths = t.topPaths.sort((a, b) => b.views - a.views).slice(0, 3);
    const workers = new Map<string, WorkerHealth>();
    for (const w of account?.workers ?? []) {
        const prev = workers.get(w.dimensions.scriptName);
        // Cloudflare reports CPU time in microseconds (a live check showed 675088 for a 0.68 s p99)
        const cpu = w.quantiles?.cpuTimeP99 == null ? null : w.quantiles.cpuTimeP99 / 1000;
        workers.set(w.dimensions.scriptName, {
            requests: (prev?.requests ?? 0) + w.sum.requests,
            errors: (prev?.errors ?? 0) + w.sum.errors,
            cpuP99: prev?.cpuP99 == null ? cpu : cpu == null ? prev.cpuP99 : Math.max(prev.cpuP99, cpu),
        });
    }
    return { traffic, workers };
}

export const siteKey = bare;

/** Throws when Cloudflare refuses the token or the query; the page then says so. */
export async function fetchAnalytics(token: string, account: string, now = new Date()): Promise<Analytics> {
    const at = (ms: number) => new Date(now.getTime() - ms).toISOString();
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { account, week: at(7 * 86_400_000), day: at(86_400_000), now: now.toISOString() } }),
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Cloudflare: ${res.status}`);
    const body = (await res.json()) as { data?: unknown; errors?: { message: string }[] | null };
    if (body.errors?.length) throw new Error(`Cloudflare: ${body.errors.map(e => e.message).join('; ')}`);
    return summarise(body.data, now);
}

const pct = new Intl.NumberFormat('en-IE', { style: 'percent', maximumFractionDigits: 1 });

/** One task per Worker whose last 24 hours had more than 1% errors (at least 10 of them, so one bad request isn't news). */
export function workerTasks(projects: { name: string; worker: string | null }[], a: Analytics, account: string) {
    return projects.flatMap(p => {
        const w = p.worker ? a.workers.get(p.worker) : undefined;
        if (!w || w.errors < 10 || w.errors / w.requests <= 0.01) return [];
        return [{
            project: p.name, level: 2 as const, action: 'Look at Worker errors on', title: p.worker!,
            detail: `${pct.format(w.errors / w.requests)} of ${new Intl.NumberFormat('en-IE').format(w.requests)} requests failed in 24 hours`,
            href: `https://dash.cloudflare.com/${account}/workers/services/view/${p.worker}/production/observability/logs`,
        }];
    });
}
