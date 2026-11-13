import { z } from 'zod';
import type { Project } from '../../lighthouse.config';

// Only what the page needs: the API also returns httpPassword and a per-monitor apiKey, which must never reach the page
const Monitor = z.object({
    id: z.number(),
    url: z.string(),
    status: z.string(), // UP, DOWN, PAUSED, and others we treat as unknown
    currentStateDuration: z.number().nullable().optional(), // seconds in the current state
});

export type Uptime = { id: number; state: 'up' | 'down' | 'paused' | 'unknown'; seconds: number | null };

const STATES: Record<string, Uptime['state']> = { UP: 'up', DOWN: 'down', PAUSED: 'paused' };
const host = (url: string) => { try { return new URL(url).host.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

/** Each project's monitor, matched by address (with or without www), or null when it has none. */
export function matchUptime(projects: Project[], raw: unknown[]): (Uptime | null)[] {
    const monitors = raw.flatMap(m => {
        const parsed = Monitor.safeParse(m);
        if (!parsed.success) console.error('Unexpected UptimeRobot monitor', parsed.error.issues);
        return parsed.success ? [parsed.data] : [];
    });
    return projects.map(p => {
        const m = monitors.find(x => host(x.url) === host(`https://${p.site}`));
        return m ? { id: m.id, state: STATES[m.status] ?? 'unknown', seconds: m.currentStateDuration ?? null } : null;
    });
}

/** All monitors on the account. Throws when UptimeRobot can't be reached or refuses the key. */
export async function fetchMonitors(key: string): Promise<unknown[]> {
    // shortcut: the first page of monitors only (6 today); follow the response's cursor if the account ever outgrows one page
    const res = await fetch('https://api.uptimerobot.com/v3/monitors', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`UptimeRobot: ${res.status}`);
    const { data } = (await res.json()) as { data?: unknown[] };
    if (!Array.isArray(data)) throw new Error('UptimeRobot: no data');
    return data;
}
