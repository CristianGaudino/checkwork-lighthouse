import { z } from 'zod';
import type { Project } from '../../lighthouse.config';
import { ago, type Task } from './today';

/** The registered domain a site is under: "www.demo.checkwork.ie" is checkwork.ie. */
// shortcut: the last two labels, so a two-part suffix like .co.uk reads as co.uk. Use the public suffix list if one comes along.
export const domainOf = (site: string) => site.toLowerCase().split('.').slice(-2).join('.');

const Bootstrap = z.object({ services: z.array(z.tuple([z.array(z.string()), z.array(z.string())])) });
const Rdap = z.object({ events: z.array(z.object({ eventAction: z.string(), eventDate: z.string() })) });

/** The expiry date from a registry's RDAP answer, or null. */
export const expiryOf = (raw: unknown) => Rdap.safeParse(raw).data?.events.find(e => e.eventAction === 'expiration')?.eventDate ?? null;

/**
 * When each domain expires, from its registry's RDAP (free, no key), found through IANA's list of RDAP servers.
 * A TLD without RDAP is left out: .ie has none, so its domains read as unknown. Throws only when IANA's list fails.
 */
export async function fetchExpiry(domains: string[]): Promise<Map<string, string>> {
    const res = await fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`IANA RDAP list: ${res.status}`);
    const { services } = Bootstrap.parse(await res.json());
    const found = await Promise.all(domains.map(async d => {
        const base = services.find(([tlds]) => tlds.includes(d.split('.').at(-1)!))?.[1][0];
        if (!base) return null;
        const r = await fetch(`${base.replace(/\/?$/, '/')}domain/${encodeURIComponent(d)}`, { headers: { accept: 'application/rdap+json' }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
        if (!r?.ok) { console.error(`Could not read RDAP for ${d}: ${r?.status ?? 'no answer'}`); return null; }
        const at = expiryOf(await r.json().catch(() => null));
        return at ? [d, at] as const : null;
    }));
    return new Map(found.filter(f => f !== null));
}

const WARN_DAYS = 30, URGENT_DAYS = 7;

/** One task per domain expiring within 30 days (red within 7, or gone), on the first project under it. */
export function domainTasks(projects: Project[], expiry: Map<string, string>, now = Date.now()): Task[] {
    const seen = new Set<string>();
    return projects.flatMap(p => {
        const d = domainOf(p.site), at = expiry.get(d);
        if (seen.has(d) || !at) return [];
        seen.add(d);
        const days = (Date.parse(at) - now) / 86_400_000;
        if (days > WARN_DAYS) return [];
        return [{
            project: p.name, level: days <= URGENT_DAYS ? 1 : 2, action: days < 0 ? 'Domain expired:' : 'Renew', title: d,
            detail: `${days < 0 ? 'Expired' : 'Expires'} ${ago(at, now)}. Renew it at the registrar`,
            href: `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(d)}`,
        } satisfies Task];
    });
}
