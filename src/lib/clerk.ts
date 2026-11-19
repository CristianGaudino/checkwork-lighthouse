import { z } from 'zod';

/**
 * Sign-ups and active users for a site that signs in with Clerk, from the Backend API's user count
 * (GET https://api.clerk.com/v1/users/count, times in Unix milliseconds). Counts only: no user's email or name is read.
 */

/** The secret Lighthouse reads for a repo's Clerk app, so a project needs no config field: vintage gives CLERK_SECRET_KEY_VINTAGE. */
export const clerkSecretName = (repo: string) => `CLERK_SECRET_KEY_${repo.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

/** The repo signs in with Clerk when its .env.example names the secret key, so a missing key there is setup still to do. */
export const usesClerk = (envNames: string[] | undefined) => Boolean(envNames?.includes('CLERK_SECRET_KEY'));

/** `newPrev7`: sign-ups in the 7 days before the last 7, for the week-on-week change. */
export type Users = { total: number; new7: number; new30: number; newPrev7: number; active7: number; active30: number };

const Count = z.object({ total_count: z.number() });

const DAY = 86_400_000;

/** Six counts in one go. Throws when Clerk refuses the key or doesn't answer. */
export async function fetchUsers(key: string, now = Date.now()): Promise<Users> {
    const count = async (filter: Record<string, number>) => {
        const query = new URLSearchParams(Object.entries(filter).map(([k, v]) => [k, String(v)]));
        const res = await fetch(`https://api.clerk.com/v1/users/count?${query}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`Clerk: ${res.status}`);
        return Count.parse(await res.json()).total_count;
    };
    const ago = (days: number) => now - days * DAY;
    const [total, new7, new30, newPrev7, active7, active30] = await Promise.all([
        count({}),
        count({ created_at_after: ago(7) }),
        count({ created_at_after: ago(30) }),
        count({ created_at_after: ago(14), created_at_before: ago(7) }),
        count({ last_active_at_after: ago(7) }),
        count({ last_active_at_after: ago(30) }),
    ]);
    return { total, new7, new30, newPrev7, active7, active30 };
}
