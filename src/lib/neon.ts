import { z } from 'zod';

/**
 * Usage per Neon project for the current billing period, from the Neon API's project list. The plan's limits change,
 * so this shows the figures and leaves the judgement to the owner rather than hard-coding a limit.
 */

const NeonProject = z.object({
    id: z.string(),
    name: z.string(),
    active_time: z.number().optional(), // seconds a compute was running this period
    cpu_used_sec: z.number().optional(),
    synthetic_storage_size: z.number().nullable().optional(), // bytes
    compute_last_active_at: z.string().nullable().optional(),
});

export type NeonUsage = { id: string; name: string; computeHours: number | null; storageBytes: number | null; lastActive: string | null };

export function parseProjects(raw: unknown): NeonUsage[] {
    const list = z.object({ projects: z.array(z.unknown()) }).parse(raw).projects;
    return list.flatMap(p => {
        const n = NeonProject.safeParse(p);
        if (!n.success) { console.error('Unexpected Neon project', n.error.issues); return []; }
        return [{
            id: n.data.id,
            name: n.data.name,
            computeHours: n.data.active_time === undefined ? null : Math.round((n.data.active_time / 3600) * 10) / 10,
            storageBytes: n.data.synthetic_storage_size ?? null,
            lastActive: n.data.compute_last_active_at ?? null,
        }];
    });
}

/** Throws when Neon refuses the key. */
export async function fetchNeon(key: string): Promise<NeonUsage[]> {
    const res = await fetch('https://console.neon.tech/api/v2/projects', { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Neon: ${res.status}`);
    return parseProjects(await res.json());
}
