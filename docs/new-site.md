# Adding a site to Lighthouse

What a site needs for Lighthouse to show all of it. Each project page has a Setup list that links to the section here for whatever is missing. Under `npm run dev` it also has a "Set up with Claude" link, and the Projects page has "Add a site", both of which open Claude Code with this file.

**For Claude:** go through the sections in order and check what is already done before changing anything. Anything in a dashboard (UptimeRobot, Cloudflare, Vercel, GitHub settings) is for the owner to do: say exactly what to click. Changes to the site's repo go on a branch with a PR, following that repo's own rules. Never merge.

## Config

One line in `lighthouse.config.ts`: name, repo (under the owner's account), the live address with `www.` if the site uses it, and the board number. That is all the config there is. Lighthouse works everything else out from the repo and the address.

GITHUB_TOKEN covers all repositories, so a new repo needs no token change. The one exception is a private repo hosted outside Cloudflare: its deploys need Deployments: Read on that token.

## Board

Create a GitHub project for the repo (the number in its URL goes in the config line). Turn on the same automations as the other boards (Lighthouse's board has all seven on, Auto-add to project included). The Work page lists any board that has one off.

## Uptime

In UptimeRobot, add an HTTP(s) monitor for `https://` plus the address in the config. Lighthouse matches monitors by address, so there is no id to copy. The free plan checks every 5 minutes.

## Web Analytics

In Cloudflare, go to Analytics & Logs, then Web Analytics, and add the site. Choose plain "Enable", not "Enable, excluding visitor data in the EU". A site that Cloudflare proxies needs nothing else. A site hosted elsewhere (Vercel) needs the snippet Cloudflare shows, added to the root layout. Lighthouse counts it as set up once a visit is recorded.

## Checks

A workflow that runs on pull requests: copy `.github/workflows/ci.yml` from checkwork. It runs on PRs only, with `paths-ignore: ['**.md']`, because Actions minutes are shared across every private repo. Without it, PRs show "no checks", and Merge has nothing to wait for.

## Deploys

**On Cloudflare Workers:** keep `wrangler.jsonc` at the repo root, because Lighthouse reads the Worker name from it. Copy `.github/workflows/deploy-workers.yml` from checkwork. Then set the repo secrets `CLOUDFLARE_API_TOKEN` (Workers deploy) and `CLOUDFLARE_ACCOUNT_ID`. If releases should deploy, rather than every merge to main, also copy `release.yml`: Lighthouse then waits for a release before calling main "not live". When Actions minutes run out, [deploy-from-pc.md](deploy-from-pc.md) does the same deploy from this PC.

**Anywhere else (Vercel):** import the repo in the host and let its GitHub app record deploys. Lighthouse reads GitHub's record of production deploys to tell whether the site runs the latest main.

## Security alerts

In the repo's Settings, under Advanced Security (Code security on older screens), turn on Dependabot alerts. Lighthouse makes a task for any high or critical alert, and shows the rest on the project page. Dependabot security updates, on the same screen, open the PRs that fix them.

## Domain

Nothing to set up. Lighthouse reads when the domain expires from its registry and makes a task 30 days before. The .ie registry doesn't publish expiry dates, so .ie domains show a dash: keep auto-renew on at the registrar.
