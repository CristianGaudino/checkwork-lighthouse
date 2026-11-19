import { z } from 'zod';
import { OWNER, type Project } from '../../lighthouse.config';
import { githubGraphql } from './github';

/**
 * Every repo OWNER has, each with how much it asks of the owner. The status is a topic on the repo
 * (lighthouse-idle, -muted, -archived; none is active), so it needs no storage here.
 */
export const STATUSES = ['active', 'idle', 'muted', 'archived'] as const;
export type Status = (typeof STATUSES)[number];
export type Listed = Project & { status: Status };
/** What each status means, in one line, beside the status control. */
export const STATUS_MEANS = 'Active counts. Idle sits lower and leaves the counts. Muted is idle with no notifications. Archived is hidden.';
export type Owned = { name: string; site?: string; isArchived: boolean; pushedAt: string | null; topics: string[] };

export const PREFIX = 'lighthouse-';
const YEAR = 365 * 86_400_000;

/** A repo GitHub archived, then its topic, then: not pushed to in a year is archived, else active. */
export function statusOf(r: Owned, now = Date.now()): Status {
    if (r.isArchived) return 'archived';
    const set = STATUSES.find(s => r.topics.includes(PREFIX + s));
    if (set) return set;
    return r.pushedAt && now - Date.parse(r.pushedAt) > YEAR ? 'archived' : 'active';
}

/** True when a repo with no topic would read as archived, so active needs its topic written. */
export const stale = (pushedAt: string | null, now = Date.now()) => Boolean(pushedAt && now - Date.parse(pushedAt) > YEAR);

/** The repo's topics with only the lighthouse one swapped; active is no topic, unless the repo is old enough to need it. */
export function swapTopic(topics: string[], status: Status, old: boolean): string[] {
    const keep = topics.filter(t => !t.startsWith(PREFIX));
    return status === 'active' && !old ? keep : [...keep, PREFIX + status];
}

const RANK: Record<Status, number> = { active: 0, idle: 1, muted: 1, archived: 2 };

/**
 * Config lines first (they win: name, site, board), then every other repo by name, then sorted so idle and muted sit
 * below active. A config line GitHub didn't list stays active, so a renamed repo still says so.
 */
export function mergeProjects(config: Project[], owned: Owned[], now = Date.now()): Listed[] {
    const key = (s: string) => s.toLowerCase();
    const byName = new Map(owned.map(r => [key(r.name), r]));
    const configured = new Set(config.map(p => key(p.repo)));
    const listed: Listed[] = [
        ...config.map(p => { const o = byName.get(key(p.repo)); return { ...p, status: o ? statusOf(o, now) : 'active' as const }; }),
        ...owned.filter(r => !configured.has(key(r.name))).map(r => ({ name: r.name, repo: r.name, site: r.site, status: statusOf(r, now) })),
    ];
    return listed.sort((a, b) => RANK[a.status] - RANK[b.status]);
}

/** "https://www.example.com/" is "www.example.com", as config writes a site. */
export const siteOf = (url: string | null | undefined) => url?.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '') || undefined;

const Repos = z.object({
    repositories: z.object({
        nodes: z.array(z.object({
            name: z.string(), homepageUrl: z.string().nullable(), isArchived: z.boolean(), pushedAt: z.string().nullable(),
            repositoryTopics: z.object({ nodes: z.array(z.object({ topic: z.object({ name: z.string() }) })) }),
        })),
    }),
});

// shortcut: the first 100 repos (about 30 today); page with the cursor past that. Only light fields: the heavy ones load for non-archived repos (github.ts)
const QUERY = `{ user(login: ${JSON.stringify(OWNER)}) { repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: NAME, direction: ASC}) { nodes {
    name homepageUrl isArchived pushedAt repositoryTopics(first: 20) { nodes { topic { name } } }
} } } }`;

/** Every repo OWNER has that the token can see. Throws when GitHub can't be reached or answers in a shape we don't know. */
export async function fetchOwned(token: string): Promise<Owned[]> {
    const data = await githubGraphql(token, QUERY);
    return Repos.parse(data?.user).repositories.nodes.map(r => ({
        name: r.name, site: siteOf(r.homepageUrl), isArchived: r.isArchived, pushedAt: r.pushedAt, topics: r.repositoryTopics.nodes.map(n => n.topic.name),
    }));
}
