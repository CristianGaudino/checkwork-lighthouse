import { z } from 'zod';

/**
 * The top error messages per Worker over 24 hours, from Workers Logs (the Observability telemetry query API; every
 * wrangler.jsonc here has observability on). `fresh`: not seen in the logs before the Worker's latest deploy, so most
 * likely that deploy brought it. Cloudflare accepts the query only with the Workers Observability permission.
 */
export type WorkerError = { message: string; count: number; fresh: boolean };

const Result = z.object({
    result: z.object({
        calculations: z.array(z.object({
            aggregates: z.array(z.object({ count: z.number(), value: z.number().nullable().optional(), groups: z.array(z.object({ key: z.string(), value: z.unknown() })).optional() })),
        })).default([]),
    }),
});

const ERROR = '$metadata.error', SERVICE = '$metadata.service';

/** The query body: errors only, counted by `groupBy` fields, over [from, to). */
export const errorQuery = (from: number, to: number, groupBy: string[], service?: string) => ({
    queryId: 'lighthouse-errors', view: 'calculations', limit: 100, timeframe: { from, to },
    parameters: {
        datasets: [],
        filters: [{ key: ERROR, operation: 'exists', type: 'string' }, ...(service ? [{ key: SERVICE, operation: 'eq', type: 'string', value: service }] : [])],
        filterCombination: 'and',
        calculations: [{ operator: 'count', alias: 'n' }],
        groupBys: groupBy.map(value => ({ type: 'string', value })),
        orderBy: { value: 'n', order: 'desc' },
    },
});

/** Rows of the first calculation: the grouped fields by key, and the count. Separate from the fetch so it can be tested. */
export function rowsOf(raw: unknown): { by: Record<string, string>; count: number }[] {
    return (Result.parse(raw).result.calculations[0]?.aggregates ?? []).map(a => ({
        by: Object.fromEntries((a.groups ?? []).map(g => [g.key, String(g.value)])),
        count: a.value ?? a.count,
    }));
}

/** Per Worker, its top five messages, each marked fresh when it is missing from `before` (what that Worker logged before its deploy). */
export function topErrors(recent: ReturnType<typeof rowsOf>, before: Map<string, Set<string>>): Map<string, WorkerError[]> {
    const out = new Map<string, WorkerError[]>();
    for (const r of recent) {
        const worker = r.by[SERVICE], message = r.by[ERROR];
        if (!worker || !message) continue;
        const list = out.get(worker) ?? [];
        if (list.length < 5) list.push({ message, count: r.count, fresh: before.has(worker) && !before.get(worker)!.has(message) });
        out.set(worker, list);
    }
    return out;
}

const DAY = 86_400_000;
// Workers Logs keeps 3 days on the free plan (7 on paid): the window before a deploy reaches back that far at most
const KEPT = 3 * DAY;

/**
 * One query for the last day across every Worker, then, for each Worker with errors, one for the time before its latest
 * deploy (`deployed`, from fetchLive). Throws when Cloudflare refuses: the page then shows a setup note.
 */
export async function fetchWorkerErrors(token: string, account: string, deployed: Map<string, string>, now = Date.now()): Promise<Map<string, WorkerError[]>> {
    const query = async (body: object) => {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`, {
            method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`Cloudflare observability: ${res.status}`);
        return rowsOf(await res.json());
    };
    const recent = await query(errorQuery(now - DAY, now, [SERVICE, ERROR]));
    const workers = [...new Set(recent.map(r => r.by[SERVICE]).filter(Boolean))];
    const before = new Map(await Promise.all(workers.flatMap(w => {
        const at = Date.parse(deployed.get(w) ?? '');
        // Unknown deploy time, or one older than the logs reach: nothing to compare with, so nothing is called fresh
        if (!(at > now - KEPT)) return [];
        return [query(errorQuery(now - KEPT, at, [ERROR], w)).then(rows => [w, new Set(rows.map(r => r.by[ERROR]))] as const)];
    })));
    return topErrors(recent, before);
}
