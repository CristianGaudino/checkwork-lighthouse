import { z } from 'zod';

/**
 * Settings a Worker should have and doesn't (#34): the names in the repo's .env.example that aren't a binding on the
 * Worker (a secret, a var or anything else). Cloudflare lists names only, never values. NEXT_PUBLIC_ names are left out:
 * they are built into the pages, not read on the Worker.
 */

/** The variable names an .env.example sets, commented-out ones left out. */
export const envNames = (text: string | null | undefined) =>
    [...(text ?? '').matchAll(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/gm)].map(m => m[1]);

export const missingOnWorker = (names: string[], bindings: Set<string>) =>
    names.filter(name => !name.startsWith('NEXT_PUBLIC_') && !bindings.has(name));

const Settings = z.object({ result: z.object({ bindings: z.array(z.object({ name: z.string() })).default([]) }) });

/** Every binding's name on a Worker. Needs Workers Scripts: Read. Throws when Cloudflare refuses; null when there's no such Worker. */
export async function fetchBindings(token: string, account: string, worker: string): Promise<Set<string> | null> {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${encodeURIComponent(worker)}/settings`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Cloudflare: ${res.status}`);
    return new Set(Settings.parse(await res.json()).result.bindings.map(b => b.name));
}
