# Deploy from this PC

For when GitHub Actions can't deploy: usually the shared 2,000 minutes have run out, so private repos' deploy workflows never start. Lighthouse shows the site as "not live" and, under `npm run dev`, offers **Deploy from this PC**. That link opens Claude Code with a prompt pointing here. Lighthouse itself never runs the deploy.

## Once per PC

1. WSL with Ubuntu: `wsl --install -d Ubuntu` in an admin terminal, then reboot. OpenNext doesn't build on Windows.
2. Node 24 in Ubuntu, from nodejs.org, checked against its SHA-256 (`~/.local/node`, on `PATH` via `~/.bashrc`).
3. `npx wrangler login` in an Ubuntu terminal. It stays logged in at `~/.config/.wrangler`; `npx wrangler logout` removes it.

## Steps (for Claude)

Run each step through `wsl.exe -d Ubuntu -- bash <script>`, with the script written to the scratchpad. In Git Bash, set `MSYS_NO_PATHCONV=1` so `/mnt/c/...` paths survive.

1. **What to ship.** Fetch in `C:\Git\<repo>` (Windows). A repo with `.github/workflows/release.yml` deploys releases: ship its latest release tag, or ask the owner before cutting a new one. Any other repo ships `origin/main`. Say what production is missing (`git log`) before going on.
2. **Read the repo's deploy workflow** (`deploy*.yml`) and follow it step by step. Its build-time `env` values are public or placeholders: copy them as they are.
3. **Clone on the Linux side**, from the Windows copy so no GitHub login is needed: `git clone /mnt/c/Git/<repo> ~/<repo>` and check out the commit. The first time, run `git config --global --add safe.directory /mnt/c/Git/<repo>/.git`. Never build inside `/mnt/c`, and never touch the Windows working tree (other sessions use it).
4. **Checks before anything touches production:** `npm ci`, then the workflow's tests, lint and migration checks, then `npx opennextjs-cloudflare build`.
5. **Database migrations.**
   - D1 (`wrangler d1 migrations apply`) works with the wrangler login: run it as the workflow does.
   - Postgres (Neon) needs `DATABASE_URL`, which isn't on this PC. If the changes since production add no migration files, skip the step and say so. If they do, stop and ask the owner.
6. **Deploy:** run the workflow's `populateCache` and `wrangler deploy` steps, with the same `--var` flags. Set `CLOUDFLARE_ACCOUNT_ID` so wrangler never asks which account to use.
7. **Release repos:** create the release as a pre-release before deploying (`gh release create <tag> --target <full sha> --generate-notes --prerelease`), then mark it latest afterwards (`gh release edit <tag> --prerelease=false --latest`).
8. **After:** run the workflow's wait-for-site and settings checks with `curl`. Steps that need secrets only GitHub has (end-to-end tests against production, announcement drafts) are skipped: tell the owner which ones.

Never commit, push or merge as part of a deploy. Never accept wrangler's "create a new Worker?": it means the name or account is wrong.
