import { z } from 'zod';
import { githubGraphql } from './github';
import { OWNER, type Project } from '../../lighthouse.config';

/**
 * The open work across every project board, by Status. Projects belong to the user account, which fine-grained tokens
 * cannot read, so this uses GITHUB_PROJECTS_TOKEN (classic, read:project only). That token sees an item's Title and
 * Status everywhere, but the issue itself only in public repos; a private repo's links come from GITHUB_TOKEN's issue
 * list when it has Issues read, matched by title, else they open the project board.
 */

export const COLUMNS = ['In Progress', 'In Review', 'Todo'] as const;
export type Column = (typeof COLUMNS)[number];
export type Card = { project: string; title: string; href: string; kind: string | null };
export type Board = { columns: Record<Column, Card[]>; backlog: { project: string; count: number; href: string }[] };

const Item = z.object({
    type: z.string(),
    title: z.object({ text: z.string() }).nullable(),
    status: z.object({ name: z.string() }).nullable(),
    content: z.object({ url: z.string().optional(), issueType: z.object({ name: z.string() }).nullable().optional() }).nullable(),
});
const Workflow = z.object({ name: z.string(), enabled: z.boolean() });
const ProjectItems = z.object({ projectV2: z.object({ items: z.object({ nodes: z.array(z.unknown()) }), workflows: z.object({ nodes: z.array(Workflow) }).optional() }).nullable() }).nullable();

export type ProjectData = { items: unknown[]; workflows: z.infer<typeof Workflow>[] } | null;

// shortcut: the first 100 open items per project (How Many? has 50 today); page with the cursor if a board outgrows it
const ITEMS = `items(first: 100, query: "-status:Done is:open") { nodes {
    type title: fieldValueByName(name: "Title") { ... on ProjectV2ItemFieldTextValue { text } }
    status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
    content { ... on Issue { url issueType { name } } ... on PullRequest { url } }
} }`;

/** Open issue URLs by "repo title", from the token that can read issues. Empty when it can't (no Issues read yet). */
export async function fetchIssueLinks(projects: Project[], token: string): Promise<Map<string, string>> {
    const query = `{ ${projects.map((p, i) => `r${i}: repository(owner: ${JSON.stringify(OWNER)}, name: ${JSON.stringify(p.repo)}) { issues(states: OPEN, first: 100) { nodes { title url } } }`).join('\n')} }`;
    const links = new Map<string, string>();
    const data = (await githubGraphql(token, query).catch(() => undefined)) ?? {};
    projects.forEach((p, i) => {
        const nodes = (data[`r${i}`] as { issues?: { nodes?: { title: string; url: string }[] } } | null)?.issues?.nodes ?? [];
        for (const n of nodes) links.set(`${p.repo} ${n.title}`, n.url);
    });
    return links;
}

/** Each project's open items and its automations (the built-in workflows), in config order; null where the token can't read it. */
export async function fetchBoardItems(projects: Project[], token: string): Promise<ProjectData[]> {
    const query = `{ ${projects.map((p, i) => `p${i}: user(login: ${JSON.stringify(OWNER)}) { projectV2(number: ${p.project}) { ${ITEMS} workflows(first: 20) { nodes { name enabled } } } }`).join('\n')} }`;
    const data = (await githubGraphql(token, query)) ?? {};
    return projects.map((_, i) => {
        const p = ProjectItems.safeParse(data[`p${i}`] ?? null).data?.projectV2;
        return p ? { items: p.items.nodes, workflows: p.workflows?.nodes ?? [] } : null;
    });
}

/**
 * Automations a project has off (or lacks) that another project has on, so every board behaves the same. GitHub's API
 * can read these but not switch them on, so the page links to each board's settings.
 */
export function automationGaps(projects: Project[], data: ProjectData[]) {
    const used = new Set(data.flatMap(d => d?.workflows.filter(w => w.enabled).map(w => w.name) ?? []));
    return projects.flatMap((p, i) => {
        const d = data[i];
        if (!d) return [];
        const on = new Set(d.workflows.filter(w => w.enabled).map(w => w.name));
        const off = [...used].filter(n => !on.has(n)).sort();
        return off.length ? [{ project: p.name, off, href: `https://github.com/users/${OWNER}/projects/${p.project}/workflows` }] : [];
    });
}

export function groupBoard(projects: Project[], data: ProjectData[], links: Map<string, string>): Board {
    const columns = Object.fromEntries(COLUMNS.map(c => [c, [] as Card[]])) as Record<Column, Card[]>;
    const backlog: Board['backlog'] = [];
    projects.forEach((p, i) => {
        const board = `https://github.com/users/${OWNER}/projects/${p.project}`;
        let waiting = 0;
        for (const raw of data[i]?.items ?? []) {
            const it = Item.safeParse(raw);
            if (!it.success || !it.data.title) continue;
            const status = it.data.status?.name ?? 'Backlog';
            if (status === 'Backlog' || !(COLUMNS as readonly string[]).includes(status)) { waiting++; continue; }
            const title = it.data.title.text;
            columns[status as Column].push({
                project: p.name,
                title,
                href: it.data.content?.url ?? links.get(`${p.repo} ${title}`) ?? board,
                kind: it.data.type === 'PULL_REQUEST' ? 'PR' : it.data.content?.issueType?.name ?? null,
            });
        }
        if (waiting) backlog.push({ project: p.name, count: waiting, href: board });
    });
    return { columns, backlog };
}
