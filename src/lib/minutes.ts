import { z } from 'zod';
import { OWNER } from '../../lighthouse.config';
import type { Task } from './today';

/** GitHub Free's Actions minutes a month, shared by every private repo on the account. */
export const INCLUDED = 2000;
// Minutes on other runners count more against the allowance
const MULTIPLIER: Record<string, number> = { 'Actions Linux': 1, 'Actions Windows': 2, 'Actions macOS': 10 };

const Item = z.object({ product: z.string(), sku: z.string(), quantity: z.number(), unitType: z.string(), repositoryName: z.string().nullable().optional() });

/** `free`: a public repo, whose minutes GitHub does not count against the allowance. */
export type Minutes = { used: number; projected: number; byRepo: { repo: string; minutes: number; free: boolean }[]; monthEnd: Date };

/**
 * This month's Actions minutes from the billing usage report, by repo, with a straight-line projection to month end (UTC).
 * The report lists public repos too, but only private ones use the allowance; a repo not known to be public counts.
 */
export function summarise(raw: unknown[], publicRepos: ReadonlySet<string> = new Set(), now = new Date()): Minutes {
    const per = new Map<string, number>();
    for (const r of raw) {
        const i = Item.safeParse(r);
        if (!i.success || i.data.product !== 'actions' || i.data.unitType !== 'Minutes') continue;
        const repo = i.data.repositoryName || 'other';
        per.set(repo, (per.get(repo) ?? 0) + i.data.quantity * (MULTIPLIER[i.data.sku] ?? 1));
    }
    const byRepo = [...per].map(([repo, minutes]) => ({ repo, minutes: Math.round(minutes), free: publicRepos.has(repo) }))
        .sort((a, b) => Number(a.free) - Number(b.free) || b.minutes - a.minutes);
    const used = byRepo.reduce((n, r) => n + (r.free ? 0 : r.minutes), 0);
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const elapsed = Math.max(now.getTime() - start, 3_600_000); // at least an hour, so the 1st doesn't project wildly
    return { used, projected: Math.round(used * ((monthEnd.getTime() - start) / elapsed)), byRepo, monthEnd };
}

const fmt = new Intl.NumberFormat('en-IE');
const BILLING = 'https://github.com/settings/billing/usage';

/** Red once the allowance is gone, amber when this month is on pace to go over it. */
export function minutesTask(m: Minutes): Task | null {
    if (m.used >= INCLUDED) return { project: 'GitHub Actions', level: 1, action: 'Out of Actions minutes:', title: `${fmt.format(m.used)} of ${fmt.format(INCLUDED)} used`, detail: 'Workflows stop running until the month resets', href: BILLING };
    if (m.projected > INCLUDED) return { project: 'GitHub Actions', level: 2, action: 'Slow down on Actions:', title: `on pace for ${fmt.format(m.projected)} minutes`, detail: `${fmt.format(m.used)} of ${fmt.format(INCLUDED)} used so far this month`, href: BILLING };
    return null;
}

/** The current month's usage items. Throws when GitHub refuses (the token needs the Plan read permission). */
export async function fetchUsage(token: string, now = new Date()): Promise<unknown[]> {
    const url = `https://api.github.com/users/${OWNER}/settings/billing/usage?year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'lighthouse' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`GitHub billing: ${res.status}`);
    const { usageItems } = (await res.json()) as { usageItems?: unknown[] };
    if (!Array.isArray(usageItems)) throw new Error('GitHub billing: no usageItems');
    return usageItems;
}
