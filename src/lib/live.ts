import { z } from 'zod';
import type { RepoStatus } from './github';

/**
 * What each site's Worker is running compared with main: from the time of the Worker's latest Cloudflare deployment,
 * however it was deployed (Actions, or this PC when Actions is out of minutes). The token needs Workers Scripts: Read.
 */

export type LiveState =
    | { state: 'live'; since: string }
    // Merged in the last few minutes: the deploy workflow is most likely still running
    | { state: 'deploying'; since: string; label: string }
    | { state: 'behind'; since: string; label: string };

const DEPLOY_GRACE_MS = 15 * 60_000;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// shortcut: compares times, so a rollback to an older version still reads as live. Compare commit SHAs if rollbacks become routine.
export function liveState(repo: RepoStatus | undefined, liveAt: string | undefined, now = Date.now()): LiveState | null {
    if (!repo || !liveAt) return null;
    const since = Date.parse(liveAt);
    let label: string | null = null;
    let newest = 0;
    if (repo.releasesDeploy) {
        // Releases deploy, so the latest release is what should be live; commits after it are a release task, not a deploy
        const at = repo.release?.date ? Date.parse(repo.release.date) : 0;
        if (at > since) { label = `${repo.release!.tag} not live`; newest = at; }
    } else {
        const missing = repo.main.merges.map(Date.parse).filter(t => t > since);
        const head = repo.main.head ? Date.parse(repo.main.head) : 0;
        if (missing.length) { label = `${plural(missing.length, 'merge')} not live`; newest = Math.max(...missing); }
        else if (head > since) { label = 'Main not live'; newest = head; }
    }
    if (!label) return { state: 'live', since: liveAt };
    return { state: now - newest < DEPLOY_GRACE_MS ? 'deploying' : 'behind', since: liveAt, label };
}

const Deployments = z.object({ result: z.object({ deployments: z.array(z.object({ created_on: z.string() })) }) });

/** When each Worker was last deployed. A Worker Cloudflare doesn't know is left out; a refused token throws ("Cloudflare: 403"). */
export async function fetchLive(token: string, account: string, workers: string[]): Promise<Map<string, string>> {
    const entries = await Promise.all(workers.map(async name => {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${encodeURIComponent(name)}/deployments`, {
            headers: { authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Cloudflare: ${res.status}`);
        const latest = Deployments.parse(await res.json()).result.deployments.map(d => d.created_on).sort().at(-1);
        return latest ? [name, latest] as const : null;
    }));
    return new Map(entries.filter(e => e !== null));
}
