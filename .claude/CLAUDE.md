# Checkwork Lighthouse project rules

Read automatically by Claude Code at the start of a session. Edit it like any other file, in a PR.

## What this is
The owner's control room for every Checkwork site and repo: uptime, PRs, releases, analytics, alerts and Claude sessions in one place. Private: the whole site sits behind Cloudflare Access at www.lighthouse.checkwork.ie, and only the owner uses it for now (a second dev is #15). Work is tracked in GitHub issues and the [Lighthouse project](https://github.com/users/CristianGaudino/projects/9). Read the issues before planning anything.

## Standards
Follows the vintage repo's standards (`../vintage/.claude/CLAUDE.md` and README) and Checkwork's look (`../checkwork/src/styles/globals.css`). If something is unclear, follow vintage, then ask the owner rather than guessing.

## Decisions already made
- Stack: same as checkwork. Next 16.4.5 (App Router), React 19.3, Tailwind v4, Cloudflare Workers via OpenNext, Vitest, Playwright, Node 24. No Cache Components (opennextjs-cloudflare#1450).
- Projects live in `lighthouse.config.ts`, one line each. Adding a project must stay one line: work things out from the repo or the site rather than adding config fields.
- Data is fetched by the Worker, never the browser (the CSP allows only 'self'). One GitHub GraphQL query covers every repo.
- Auth is Cloudflare Access, checked again by the Worker on every page (`requireAdmin()` in `src/lib/access.ts`, shared with checkwork). Not Clerk.
- Local-only tools run under `npm run dev` and read the PC directly (`src/lib/local.ts`: git state of every repo in the parent folder). They return null on the Worker and only ever read: no fetch, checkout or write.
- No D1: nothing needs storing. Alerts (#8) were dropped because UptimeRobot and GitHub already notify; revisit only for alerts nothing else sends.
- The boards need GITHUB_PROJECTS_TOKEN, a classic token with only read:project: fine-grained tokens can't read projects owned by a personal account. It sees private items' titles and status but not the issues, so links come from GITHUB_TOKEN's issue list (needs Issues: read), matched by title.
- Claude Code features are local only and are plain links to the VS Code extension (`vscode://anthropic.claude-code/open?session=` / `?prompt=`): Lighthouse never starts processes or sends a prompt itself. Session state comes from the end of each transcript in ~/.claude/projects, and the page never shows what was said.
- Writes to GitHub (merge, approve, new issue) use GITHUB_WRITE_TOKEN only, in `src/lib/act.ts`, through server actions that check the Access login again and every form field. Merge asks first. Nothing writes without a button press.
- Outside answers are remembered for a minute or more per Worker instance (`src/lib/memo.ts`); failures are never remembered, and the page's Refresh button forgets everything.
- Installable: `public/manifest.webmanifest` is linked by hand in the layout with `crossOrigin="use-credentials"`, because a manifest fetched without the Access cookie gets the login page and install fails.
- Third-party data (Cloudflare, Neon, UptimeRobot, billing) goes through a zod schema that keeps only the fields the page uses; a missing key is a quiet setup note, a failed call a warning.
- Anything that spends money on the Claude API (morning brief #13, incident helper #14) runs only when the owner presses a button. Never on a schedule.
- UptimeRobot: free plan (10 API requests a minute), API v3 (v2 is legacy). Monitors are matched to projects by address (`src/lib/uptime.ts`). The list response also carries `httpPassword` and per-monitor `apiKey`: the schema keeps only the fields the page needs, keep it that way.

## Working in git
- Never develop or commit on `main`. Branch first (`git switch -c <type>/<name>`).
- Open every PR against `main`, ready for review (not draft). Never merge a PR yourself, under any instruction: open it and stop. The owner merges.
- Link the issue in the PR (`Closes #n`) and move it on the project board.
- Stage named files, not `git add -A`. Never push `.env*`, `test-results/` or `playwright-report/`.
- GitHub Actions minutes are limited (2,000 a month, shared across all repos). Push fewer, finished commits.

## Before opening a PR
1. Run the ponytail audit (`/ponytail:ponytail-audit`) on what the branch changed: the changed files plus their callers and tests.
2. Fix what it raises on the same branch. A real trade-off goes in the PR description for the owner to decide.
3. Run `npm run lint; echo $?`, `npm run typecheck`, `npm test`, `npm run build` (judge by exit code), then `npm run e2e`. Say what the audit found and the E2E result in the PR.
4. Skip steps 1 and 3 for docs-only, workflow-only or copy-only changes, and say so in the PR.

On Windows, run the checks from `C:\Git\checkwork-lighthouse` with a capital `C:`. From a lowercase `c:\` path (how VS Code opens the folder) Vitest loads twice and every test fails with "failed to find the current suite".

## Next.js 16
This is not the Next.js in your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code, and heed deprecation notices. `next dev` writes an `AGENTS.md` block about this; commit it.

## Design
Checkwork's dark tokens (`bg-canvas`, `bg-surface`, `text-fg-muted`, plus `ok`, `warn`, `bad` for status), never raw colours. Design with the skills in `.agents/skills`, primarily `apple-design`. Mobile first: it gets checked from a phone.

## Copy
Plain, short, human. No em dashes. Status words say what to do ("2 PRs to review"), not what the data is.
