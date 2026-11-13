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
            storageBytes: null,
            lastActive: n.data.compute_last_active_at ?? null,
        }];
    });
}

const Branches = z.object({ branches: z.array(z.object({ primary: z.boolean().optional(), default: z.boolean().optional(), logical_size: z.number().nullable().optional() })) });

/**
 * The primary branch's size in bytes. The project's own storage figure came back 0 on a live check (the plan doesn't
 * fill it), while each branch carries its real logical_size.
 */
export function primarySize(raw: unknown): number | null {
    const branches = Branches.safeParse(raw).data?.branches ?? [];
    return (branches.find(b => b.primary ?? b.default) ?? branches[0])?.logical_size ?? null;
}

const get = async (key: string, path: string) => {
    const res = await fetch(`https://console.neon.tech/api/v2${path}`, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Neon: ${res.status}`);
    return res.json();
};

/** Throws when Neon refuses the key. One call for the projects, then one per project for its branch sizes. */
export async function fetchNeon(key: string): Promise<NeonUsage[]> {
    const projects = parseProjects(await get(key, '/projects'));
    return Promise.all(projects.map(async p => ({
        ...p,
        // A failed size lookup leaves the size unknown rather than hiding the project
        storageBytes: primarySize(await get(key, `/projects/${encodeURIComponent(p.id)}/branches`).catch(() => null)),
    })));
}
