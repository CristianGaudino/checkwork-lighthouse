import { z } from 'zod';

/** What the paid services cost. Each source is optional; only the fields the page shows are kept. */

/** UTC midnight on the 1st of this month: the range bills run on. */
export const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

const Cost = z.object({ data: z.array(z.object({ amount: z.string() })), has_more: z.boolean().optional(), next_page: z.string().nullable().optional() });

/** Sum of the rows' amounts (decimal strings in cents), in dollars. */
export const dollars = (rows: { amount: string }[]) => rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) / 100;

/**
 * Claude API spend this month in dollars, from the Usage and Cost Analytics API (an Admin API key). It lags by a few
 * hours, so today's newest calls may not be in yet. Throws on refusal.
 */
export async function fetchClaudeCost(key: string, now = new Date()): Promise<number> {
    const end = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
    if (end <= monthStart(now)) return 0; // the month's first hour: nothing to ask for yet
    const rows: { amount: string }[] = [];
    let page: string | null | undefined;
    // shortcut: at most five pages; with no grouping the whole month is one row
    for (let i = 0; i < 5; i++) {
        const q = new URLSearchParams({ starting_at: monthStart(now).toISOString(), ending_at: end.toISOString(), ...(page ? { page } : {}) });
        const res = await fetch(`https://api.anthropic.com/v1/organizations/analytics/cost?${q}`, {
            headers: { 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'analytics-usage-cost-2026-08-24' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Anthropic cost: ${res.status}`);
        const body = Cost.parse(await res.json());
        rows.push(...body.data);
        if (!body.has_more || !body.next_page) break;
        page = body.next_page;
    }
    return dollars(rows);
}

const Subs = z.object({ result: z.array(z.object({
    price: z.number().optional(), currency: z.string().optional(), frequency: z.string().optional(),
    rate_plan: z.object({ public_name: z.string().optional(), id: z.string().optional() }).optional(),
})).nullable() });

export type Plan = { name: string; perMonth: number; currency: string };

/** A subscription's price per month: yearly ones divided by twelve, anything else (monthly, or unknown) as it is. */
export function plans(raw: unknown): Plan[] {
    return (Subs.parse(raw).result ?? []).filter(s => s.price).map(s => ({
        name: s.rate_plan?.public_name ?? s.rate_plan?.id ?? 'Subscription',
        perMonth: s.frequency === 'yearly' ? s.price! / 12 : s.frequency === 'quarterly' ? s.price! / 3 : s.price!,
        currency: s.currency ?? 'USD',
    }));
}

/** The Cloudflare account's paid subscriptions. The token needs Billing: Read. Throws on refusal. */
export async function fetchCloudflarePlans(token: string, account: string): Promise<Plan[]> {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/subscriptions`, {
        headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Cloudflare subscriptions: ${res.status}`);
    return plans(await res.json());
}
