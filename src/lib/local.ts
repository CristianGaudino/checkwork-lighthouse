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

export const needsLook = (r: LocalRepo) => r.changed > 0 || r.ahead > 0 || r.behind > 0 || r.notPushed.length > 0 || r.goneRemote.length > 0;

/** null outside `next dev`. Reads, never writes: no fetch, no checkout. */
export async function readLocalRepos(): Promise<{ root: string; repos: LocalRepo[] } | null> {
    if (process.env.NODE_ENV !== 'development') return null;
    const [{ execFile }, { readdir, stat }, path] = await Promise.all([import('node:child_process'), import('node:fs/promises'), import('node:path')]);
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
            return { name, ...status, ...branches };
        } catch (error) {
            console.error(`Could not read git state of ${name}`, error);
            return null;
        }
    }));
    return { root, repos: repos.filter((r): r is LocalRepo => r !== null).sort((a, b) => Number(needsLook(b)) - Number(needsLook(a)) || a.name.localeCompare(b.name)) };
}
