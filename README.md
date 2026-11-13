# Checkwork Lighthouse

Every Checkwork site, repo and release on one screen: what is down, what needs a review, what is waiting to ship.

Lives at **https://www.lighthouse.checkwork.ie**, behind Cloudflare Access.

## Add a project

One line in [`lighthouse.config.ts`](lighthouse.config.ts): the repo, the live address and the GitHub project number. Uptime (next, in #4) will be matched to its UptimeRobot monitor by the address, so no monitor id is needed.

## Run it locally

Needs Node 24.

```
npm install
cp .env.example .env.local       # then fill in the tokens
npm run dev                      # http://localhost:3000
```

The Access check is skipped under `npm run dev` only.

## Checks

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | Type check |
| `npm test` | Unit tests |
| `npm run build` | Next build |
| `npm run e2e` | Builds the Worker, serves it and checks every page is closed without an Access login |

## Deploying

Merging to `main` does not deploy. Run the **Release** workflow from the Actions tab and pick major, minor or patch. It tags the next version, then the deploy workflow tests, builds, deploys the Worker and runs the e2e suite against the live site. Both are gated on the repository variable `DEPLOY_ENABLED` being `true`, and need the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. To roll back, run **Deploy (Cloudflare Workers)** with an older tag.

## Secrets

On the Worker (Cloudflare dashboard, Workers & Pages, lighthouse, Settings, Variables and Secrets, type **Secret**; or `npx wrangler secret put NAME`). Locally, in `.env.local`.

| Secret | What for |
|---|---|
| `GITHUB_TOKEN` | Fine-grained token with **All repositories** (so a newly added project just works), read-only: Contents, Pull requests and Metadata. |
| `UPTIMEROBOT_API_KEY` | UptimeRobot's read-only API key. |
| `ACCESS_TEAM_DOMAIN` | Your Access team domain, such as `plain-tree-3979.cloudflareaccess.com`. |
| `ACCESS_AUD` | The audience tag of the Access application covering the whole site. |

With `ACCESS_*` missing every page returns a 404.

Planning lives in GitHub issues and the [Lighthouse project](https://github.com/users/CristianGaudino/projects/9).
