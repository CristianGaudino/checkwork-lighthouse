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
// shortcut: the query keeps the top 100 messages; a Worker with more distinct ones (ids in messages) could call an old one new. Fine at this traffic.

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

/** The top five messages, each marked fresh when it is missing from `before` (what the Worker logged before its deploy; null when unknown). */
export function topErrors(recent: ReturnType<typeof rowsOf>, before: Set<string> | null): WorkerError[] {
    return recent.flatMap(r => (r.by[ERROR] ? [{ message: r.by[ERROR], count: r.count, fresh: before !== null && !before.has(r.by[ERROR]) }] : [])).slice(0, 5);
}

const DAY = 86_400_000;
// Workers Logs keeps 3 days on the free plan (7 on paid): the window before a deploy reaches back that far at most
const KEPT = 3 * DAY;

/**
 * One Worker's errors over the last day, by message, and, when it was deployed within the logs' reach, what it logged
 * before that deploy. Asked per Worker, so a busy one's many messages never crowd out a quiet one's. Throws when Cloudflare refuses.
 */
export async function fetchWorkerErrors(token: string, account: string, worker: string, deployedAt: string | undefined, now = Date.now()): Promise<WorkerError[]> {
    const query = async (body: object) => {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/observability/telemetry/query`, {
            method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`Cloudflare observability: ${res.status}`);
        return rowsOf(await res.json());
    };
    const at = Date.parse(deployedAt ?? '');
    const [recent, before] = await Promise.all([
        query(errorQuery(now - DAY, now, [ERROR], worker)),
        // Unknown deploy time, or one older than the logs reach: nothing to compare with, so nothing is called fresh
        // At least a day of logs before the deploy, so an error that comes a few times a day isn't called new
        at > now - KEPT + DAY ? query(errorQuery(now - KEPT, at, [ERROR], worker)).then(rows => new Set(rows.map(r => r.by[ERROR]))) : null,
    ]);
    return topErrors(recent, before);
}
