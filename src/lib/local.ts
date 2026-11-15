/** Git state of every repo next to this one, for the "This PC" section. Runs only under `next dev`: the Worker can't see the PC. */

export type LocalRepo = {
    name: string;
    branch: string;
    changed: number; // files with uncommitted changes, untracked included
    ahead: number; // commits to push on the current branch, as of the last fetch
    behind: number; // commits to pull
    notPushed: string[]; // branches that have never been pushed
    goneRemote: string[]; // branches whose remote branch was deleted, usually a merged PR
    old: string[]; // other branches with no commit for STALE_DAYS
    install: number | null; // packages the lockfile wants that aren't installed as it says; null without a package-lock.json
};

const STALE_DAYS = 30;

/** `git status --porcelain=v1 --branch`: the "## " line, then one line per changed file. */
export function parseStatus(text: string) {
    const [head = '', ...files] = text.split('\n').filter(Boolean);
    const branch = head.match(/^## (?:No commits yet on )?(.+?)(?:\.\.\.|$| \[)/)?.[1] ?? '?';
    const num = (word: string) => Number(head.match(new RegExp(`${word} (\\d+)`))?.[1] ?? 0);
    return { branch: branch === 'HEAD (no branch)' ? 'detached' : branch, changed: files.length, ahead: num('ahead'), behind: num('behind') };
}

/** `git for-each-ref refs/heads` with name, upstream, track and commit time, tab separated. */
export function parseBranches(text: string, current: string, now = Date.now()) {
    const notPushed: string[] = [], goneRemote: string[] = [], old: string[] = [];
    for (const line of text.split('\n').filter(Boolean)) {
        const [name, upstream, track, unix] = line.split('\t');
        if (name === current) continue;
        if (!upstream) notPushed.push(name);
        else if (track === '[gone]') goneRemote.push(name);
        else if (now - Number(unix) * 1000 > STALE_DAYS * 86_400_000) old.push(name);
    }
    return { notPushed, goneRemote, old };
}

type Packages = Record<string, { version?: string; optional?: boolean; devOptional?: boolean; peer?: boolean }>;

/**
 * How many packages differ between package-lock.json and what npm last installed (node_modules/.package-lock.json).
 * Compares versions, not file times: switching branches touches the lockfile without changing it. Optional packages
 * for other platforms are never installed, so their absence doesn't count. Nothing installed: every package counts.
 */
export function staleInstall(lock: { packages?: Packages }, installed: { packages?: Packages } | null): number {
    const want = lock.packages ?? {}, have = installed?.packages ?? {};
    let n = 0;
    for (const [name, p] of Object.entries(want)) {
        if (!name) continue; // "" is the project itself
        if (have[name] ? have[name].version !== p.version : !(p.optional || p.devOptional || p.peer)) n++;
    }
    for (const name of Object.keys(have)) if (!want[name]) n++;
    return n;
}

export const needsLook = (r: LocalRepo) => r.changed > 0 || r.ahead > 0 || r.behind > 0 || r.notPushed.length > 0 || r.goneRemote.length > 0 || Boolean(r.install);

/** null outside `next dev`. Reads, never writes: no fetch, no checkout. */
export async function readLocalRepos(): Promise<{ root: string; repos: LocalRepo[] } | null> {
    if (process.env.NODE_ENV !== 'development') return null;
    const [{ execFile }, { readdir, readFile, stat }, path] = await Promise.all([import('node:child_process'), import('node:fs/promises'), import('node:path')]);
    const json = (file: string) => readFile(file, 'utf8').then(JSON.parse, () => null);
    const git = (cwd: string, args: string[]) => new Promise<string>((resolve, reject) =>
        execFile('git', args, { cwd, timeout: 10_000, windowsHide: true }, (error, out) => (error ? reject(error) : resolve(out))));
    const root = path.dirname(process.cwd());
    const names = await readdir(root);
    const repos = await Promise.all(names.map(async name => {
        const dir = path.join(root, name);
        if (!(await stat(path.join(dir, '.git')).catch(() => null))) return null;
        try {
            const status = parseStatus(await git(dir, ['status', '--porcelain=v1', '--branch']));
            const branches = parseBranches(await git(dir, ['for-each-ref', 'refs/heads', '--format=%(refname:short)%09%(upstream)%09%(upstream:track)%09%(committerdate:unix)']), status.branch);
            const [lock, installed] = await Promise.all([json(path.join(dir, 'package-lock.json')), json(path.join(dir, 'node_modules', '.package-lock.json'))]);
            return { name, ...status, ...branches, install: lock ? staleInstall(lock, installed) : null };
        } catch (error) {
            console.error(`Could not read git state of ${name}`, error);
            return null;
        }
    }));
    return { root, repos: repos.filter((r): r is LocalRepo => r !== null).sort((a, b) => Number(needsLook(b)) - Number(needsLook(a)) || a.name.localeCompare(b.name)) };
}

type Listen = { LocalPort: number; OwningProcess: number };
type Proc = { ProcessId: number; ParentProcessId: number; CommandLine: string | null };

/**
 * Which repo each listening port belongs to: the node process (or a parent, up a few levels) whose command line runs
 * from that repo's folder. One entry per repo, its lowest port.
 */
export function matchServers(root: string, repos: string[], listening: Listen[], procs: Proc[]): { repo: string; port: number }[] {
    const byId = new Map(procs.map(p => [p.ProcessId, p]));
    const base = root.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
    const repoOf = (pid: number) => {
        for (let p = byId.get(pid), hops = 0; p && hops < 5; p = byId.get(p.ParentProcessId), hops++) {
            const line = (p.CommandLine ?? '').replace(/\\/g, '/').toLowerCase();
            const hit = repos.find(r => line.includes(`${base}/${r.toLowerCase()}/`));
            if (hit) return hit;
        }
        return null;
    };
    const found = new Map<string, number>();
    for (const l of [...listening].sort((a, b) => a.LocalPort - b.LocalPort)) {
        const repo = repoOf(l.OwningProcess);
        if (repo && !found.has(repo)) found.set(repo, l.LocalPort);
    }
    return [...found].map(([repo, port]) => ({ repo, port }));
}

/**
 * Dev servers running on this PC, by repo, with their port. Reads only: one PowerShell call lists the listening ports
 * and node processes. null outside `next dev`.
 * shortcut: Windows only (Get-NetTCPConnection), which is this PC; lsof would do it on a Mac.
 */
export async function readDevServers(root: string, repos: string[]): Promise<{ repo: string; port: number }[] | null> {
    if (process.env.NODE_ENV !== 'development' || process.platform !== 'win32') return null;
    const { execFile } = await import('node:child_process');
    const script = "$l = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess); $p = @(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId, ParentProcessId, CommandLine); @{ l = $l; p = $p } | ConvertTo-Json -Depth 3 -Compress";
    try {
        const out = await new Promise<string>((resolve, reject) =>
            execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 15_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(stdout))));
        const { l = [], p = [] } = JSON.parse(out) as { l?: Listen[]; p?: Proc[] };
        return matchServers(root, repos, l, p);
    } catch (error) {
        console.error('Could not list dev servers', error);
        return [];
    }
}

/** The repos next to this one, by folder name: just the ones with a .git, without asking git anything. null outside `next dev`. */
export async function listRepos(): Promise<string[] | null> {
    if (process.env.NODE_ENV !== 'development') return null;
    const [{ readdir, stat }, path] = await Promise.all([import('node:fs/promises'), import('node:path')]);
    const root = path.dirname(process.cwd());
    const names = await readdir(root).catch(() => [] as string[]);
    const found = await Promise.all(names.map(async n => ((await stat(path.join(root, n, '.git')).catch(() => null)) ? n : null)));
    return found.filter((n): n is string => n !== null).sort((a, b) => a.localeCompare(b));
}
