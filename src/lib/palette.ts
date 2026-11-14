import { OWNER, type Project } from '../../lighthouse.config';
import type { PullRequest } from './github';

/** One place the palette can jump to. `project`: whose icon it shows. */
export type Jump = { label: string; hint: string; href: string; project?: string };

type Site = { p: Project & { repoStatus?: { prs: PullRequest[] } | null; uptime?: { id: number } | null }; worker: string | null };

export const PAGES: Jump[] = [
    { label: 'Overview', hint: 'Page', href: '/' },
    { label: 'Work', hint: 'Page', href: '/work' },
    { label: 'Activity', hint: 'Page', href: '/activity' },
    { label: 'Projects', hint: 'Page', href: '/projects' },
    { label: 'Costs', hint: 'Page', href: '/costs' },
    { label: 'Usage', hint: 'Page', href: '/usage' },
];

/**
 * Everywhere the owner goes for a project, worked out from what Lighthouse already knows (the Worker's name, the
 * monitor, the Neon project with the same name), so adding a project stays one config line. `root`: this PC's folder
 * of repos, under `next dev` only, for the VS Code links.
 */
export function jumps(sites: Site[], o: { account?: string; neon?: { id: string; name: string }[]; root?: string }): Jump[] {
    const pages = o.root ? [...PAGES, { label: 'This PC', hint: 'Page', href: '/pc' }] : PAGES;
    return [...pages, ...sites.flatMap(({ p, worker }) => {
        const gh = `https://github.com/${OWNER}/${p.repo}`;
        const neon = o.neon?.find(n => [p.repo, p.name].some(x => x.toLowerCase() === n.name.toLowerCase()));
        const go = (label: string, hint: string, href: string): Jump => ({ label: `${p.name} ${label}`.trim(), hint, href, project: p.repo });
        return [
            go('', 'Project page', `/projects/${p.repo}`),
            go('site', p.site.replace(/^www\./, ''), `https://${p.site}`),
            go('repo', 'GitHub', gh),
            go('pull requests', 'GitHub', `${gh}/pulls`),
            go('issues', 'GitHub', `${gh}/issues`),
            go('Actions', 'GitHub', `${gh}/actions`),
            go('board', 'GitHub project', `https://github.com/users/${OWNER}/projects/${p.project}`),
            go('settings', 'GitHub', `${gh}/settings`),
            worker
                ? go('Worker', 'Cloudflare', o.account ? `https://dash.cloudflare.com/${o.account}/workers/services/view/${worker}/production` : 'https://dash.cloudflare.com')
                : go('deploys', 'Vercel', 'https://vercel.com/dashboard'),
            ...(p.uptime ? [go('monitor', 'UptimeRobot', `https://dashboard.uptimerobot.com/monitors/${p.uptime.id}`)] : []),
            ...(neon ? [go('database', 'Neon', `https://console.neon.tech/app/projects/${neon.id}`)] : []),
            ...(o.root ? [go('in VS Code', 'Open the folder', `vscode://file/${o.root.replace(/\\/g, '/')}/${p.repo}`)] : []),
            ...(p.repoStatus?.prs ?? []).map(pr => ({ label: `#${pr.number} ${pr.title}`, hint: `${p.name} PR`, href: pr.url, project: p.repo })),
        ];
    })];
}

/** Every word typed must appear in the label or hint, in any order. */
export const matches = (j: Jump, query: string) => {
    const hay = `${j.label} ${j.hint}`.toLowerCase();
    return query.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
};
