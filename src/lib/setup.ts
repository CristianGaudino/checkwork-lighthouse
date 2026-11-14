import type { SiteTraffic } from './cloudflare';
import type { RepoStatus } from './github';
import type { LiveState } from './live';
import type { Uptime } from './uptime';

/** `done`: null when the source that would say didn't answer. `anchor`: the section of docs/new-site.md that sets it up. */
export type Check = { label: string; done: boolean | null; fix: string; anchor: string };

/**
 * What a site needs for Lighthouse to show all of it, each with what to do when it's missing.
 * `uptime` and `repo` are undefined when that source didn't answer; `traffic` is only known once analytics answered.
 */
export function setupChecks(s: { repo: RepoStatus | undefined; uptime: Uptime | null | undefined; analytics: boolean; traffic: SiteTraffic | undefined; live: LiveState | null }): Check[] {
    const { repo } = s;
    return [
        { label: 'Uptime monitor', done: s.uptime === undefined ? null : s.uptime !== null, fix: 'Add an HTTP monitor for the site in UptimeRobot', anchor: 'uptime' },
        { label: 'Web Analytics', done: s.analytics ? Boolean(s.traffic) : null, fix: 'No visits recorded in 7 days. Turn on Web Analytics for the site in Cloudflare', anchor: 'web-analytics' },
        { label: 'Checks on PRs', done: repo ? repo.checksPrs : null, fix: 'Add a CI workflow that runs on pull requests', anchor: 'checks' },
        // A Worker deploys from a workflow; any other host (Vercel) counts once GitHub has a deploy on record
        repo?.worker
            ? { label: 'Deploys', done: repo.deploysWorker, fix: 'Add a workflow that runs wrangler deploy', anchor: 'deploys' }
            : { label: 'Deploys', done: repo ? s.live !== null : null, fix: 'Connect the repo to its host so each deploy is recorded on GitHub', anchor: 'deploys' },
    ];
}
