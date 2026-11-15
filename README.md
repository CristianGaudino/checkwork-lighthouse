# Checkwork Lighthouse

Every Checkwork site, repo and release on one screen: what is down, what needs a review, what is waiting to ship.

Lives at **https://www.lighthouse.checkwork.ie**, behind Cloudflare Access.

## Add a project

One line in [`lighthouse.config.ts`](lighthouse.config.ts): the repo, the live address and the GitHub project number. Uptime is matched to its UptimeRobot monitor by the address (with or without www), so no monitor id is needed. A project with no monitor shows as a task.

## Run it locally

Needs Node 24.

```
npm install
cp .env.example .env.local       # then fill in the tokens
npm run dev                      # http://localhost:3000
```

The Access check is skipped under `npm run dev` only. Locally you also get the Claude page (every Claude Code session on this PC: read its whole history, reply, answer its questions and permission requests, start new ones, all without VS Code; it runs on your Claude Code login, never an API key), This PC (git state, dev servers running, today's Claude use), Claude on the Overview, Fix with Claude on tasks, and VS Code links in the palette (Ctrl+K).

## Checks

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | Type check |
| `npm test` | Unit tests |
| `npm run build` | Next build |
| `npm run e2e` | Builds the Worker, serves it and checks every page is closed without an Access login |

## Deploying

Every merge to `main` deploys (for now, while most of the work is under way). The **Deploy (Cloudflare Workers)** workflow tests, builds, deploys the Worker and runs the e2e suite against the live site. It is gated on the repository variable `DEPLOY_ENABLED` being `true`, and needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. To roll back, run it from the Actions tab with an older commit or tag.

Deploy through the workflow, not `wrangler` from a laptop. Set secrets with `npx wrangler secret put` only once the Worker exists: on a missing Worker it offers to create an empty one, which replaces the real build.

## Secrets

On the Worker (Cloudflare dashboard, Workers & Pages, lighthouse, Settings, Variables and Secrets, type **Secret**; or `npx wrangler secret put NAME`). Locally, in `.env.local`.

| Secret | What for |
|---|---|
| `GITHUB_TOKEN` | Fine-grained token with **All repositories** (so a newly added project just works), read-only: Contents, Issues, Pull requests, Actions, Deployments, Dependabot alerts and Metadata, plus the account permission Plan (Actions minutes). Deployments tells when a site on Vercel last deployed; public repos work without it. Dependabot alerts gives the security alerts. |
| `UPTIMEROBOT_API_KEY` | UptimeRobot's read-only API key. |
| `GITHUB_PROJECTS_TOKEN` | Classic token with only `read:project`, for the board: fine-grained tokens can't read projects owned by a personal account. |
| `CLOUDFLARE_ANALYTICS_TOKEN` | A separate, read-only Cloudflare token (Account Analytics: Read, Workers Scripts: Read, Billing: Read) for traffic, Worker errors, which sites run the latest main, and the plan's cost. Not named `CLOUDFLARE_API_TOKEN`: wrangler reads that name for its own commands, and the deploy token keeps it. |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account the sites run in. |
| `NEON_API_KEY` | Neon API key, for compute and storage use. |
| `GITHUB_WRITE_TOKEN` | Optional. A second fine-grained token, All repositories: Pull requests, Contents, Issues and Actions **Read and write**, for the Merge, Approve, New issue, Re-run failed jobs and Run deploy buttons. Kept apart so the token behind every page load stays read-only. |
| `ANTHROPIC_API_KEY` | For the morning brief and the incident helper. Spent only when their buttons are pressed. |
| `ANTHROPIC_ADMIN_KEY` | Optional. An Admin API key from the Claude Console, read for this month's Claude API spend on the Costs page. |
| `ACCESS_TEAM_DOMAIN` | Your Access team domain, such as `plain-tree-3979.cloudflareaccess.com`. |
| `ACCESS_AUD` | The audience tag of the Access application covering the whole site. |

With `ACCESS_*` missing every page returns a 404.

Planning lives in GitHub issues and the [Lighthouse project](https://github.com/users/CristianGaudino/projects/9).
