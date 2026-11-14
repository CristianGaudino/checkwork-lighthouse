import { z } from 'zod';
import { OWNER, type Project } from '../../lighthouse.config';
import { githubGraphql } from './github';
import type { Task } from './today';

/** A repo's Dependabot alerts: whether they're on, and the open ones. */
export type Alerts = { on: boolean; open: { severity: string; pkg: string }[] };

const Data = z.record(z.string(), z.object({
    hasVulnerabilityAlertsEnabled: z.boolean(),
    vulnerabilityAlerts: z.object({ nodes: z.array(z.object({ securityVulnerability: z.object({ severity: z.string(), package: z.object({ name: z.string() }) }) })) }),
}).nullable());

/**
 * Per project, in config order; null where GitHub refused, which is every repo until GITHUB_TOKEN has Dependabot
 * alerts: Read. Asked apart from fetchRepos because a refused field makes GitHub drop the whole repo (see live.ts).
 */
export async function fetchAlerts(token: string, projects: Project[]): Promise<(Alerts | null)[]> {
    // shortcut: the first 50 open alerts per repo; more than that is a different kind of problem
    const data = await githubGraphql(token, `{ ${projects.map((p, i) => `a${i}: repository(owner: ${JSON.stringify(OWNER)}, name: ${JSON.stringify(p.repo)}) {
    hasVulnerabilityAlertsEnabled vulnerabilityAlerts(first: 50, states: OPEN) { nodes { securityVulnerability { severity package { name } } } } }`).join('\n')} }`);
    const found = Data.parse(data ?? {});
    return projects.map((_, i) => {
        const r = found[`a${i}`];
        return r ? { on: r.hasVulnerabilityAlertsEnabled, open: r.vulnerabilityAlerts.nodes.map(n => ({ severity: n.securityVulnerability.severity, pkg: n.securityVulnerability.package.name })) } : null;
    });
}

const SEVERE = new Set(['CRITICAL', 'HIGH']);
export const severe = (a: Alerts) => a.open.filter(x => SEVERE.has(x.severity)).length;

/** A task only for high and critical alerts; lower ones show on the project page and usually go with the next Dependabot PR. */
export function alertTask(p: Project, a: Alerts | null | undefined): Task | null {
    if (!a || !severe(a)) return null;
    const pkgs = [...new Set(a.open.filter(x => SEVERE.has(x.severity)).map(x => x.pkg))];
    const n = severe(a);
    return {
        project: p.name, level: 1, action: `Fix ${n === 1 ? 'a security alert' : `${n} security alerts`} in`, title: p.repo,
        detail: `High or critical, in ${pkgs.slice(0, 3).join(', ')}${pkgs.length > 3 ? ` and ${pkgs.length - 3} more` : ''}`,
        href: `https://github.com/${OWNER}/${p.repo}/security/dependabot`,
    };
}
