import { z } from 'zod';
import { OWNER } from '../../lighthouse.config';
import { githubGraphql, type RepoStatus } from './github';

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

const Deployed = z.record(z.string(), z.object({
    deployments: z.object({ nodes: z.array(z.object({ createdAt: z.string(), latestStatus: z.object({ state: z.string() }).nullable() })) }),
}).nullable());

/** The newest production deploy that succeeded: a failed deploy leaves the one before it live. */
export const lastDeploy = (nodes: { createdAt: string; latestStatus: { state: string } | null }[]) =>
    nodes.find(d => d.latestStatus?.state === 'SUCCESS')?.createdAt;

/**
 * When each repo's site was last deployed, by GitHub's record: Vercel's GitHub app writes one per deploy. For sites
 * without a Worker only, since a Worker deployed from this PC is never recorded. Asked apart from fetchRepos because
 * a token that can't read a private repo's deployments makes GitHub drop that whole repo; here it costs only its date.
 */
export async function fetchDeployed(token: string, repos: string[]): Promise<Map<string, string>> {
    if (!repos.length) return new Map();
    const data = await githubGraphql(token, `{ ${repos.map((r, i) => `d${i}: repository(owner: ${JSON.stringify(OWNER)}, name: ${JSON.stringify(r)}) {
    deployments(environments: ["Production"], first: 5, orderBy: {field: CREATED_AT, direction: DESC}) { nodes { createdAt latestStatus { state } } } }`).join('\n')} }`);
    const found = Deployed.parse(data ?? {});
    return new Map(repos.flatMap((r, i) => {
        const at = lastDeploy(found[`d${i}`]?.deployments.nodes ?? []);
        return at ? [[r, at] as const] : [];
    }));
}
