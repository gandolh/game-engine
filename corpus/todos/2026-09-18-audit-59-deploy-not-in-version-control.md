# audit-59 — The live deploy is not in the repo, and the corpus describes a script that does not exist

status: todo
created: 2026-09-18
context: found by the ops lens of the 2026-09-18 sweep. Two committed things describe two different
deploys, and the one the corpus describes is absent.

## The gap

`find . -iname '*deploy*'` (excluding `node_modules`/`.git`) returns **only corpus markdown**:
`briefs/game/done/88-deploy-real-vps-verification.md` and
`briefs/game/superseded/109-citadel-vps-deploy.md`. A find for `Caddyfile*`, `*pm2*` or `ecosystem*`
returns **nothing**. `infrastructure/` contains exactly two files: a `Dockerfile` and a
`docker-compose.yml`.

Meanwhile [`wiki/status.md`](../wiki/status.md) describes a mechanism that is not here:

> *"`deploy.ts` gained a `server` phase (rsync monorepo source minus node_modules → `npm ci` on the
> box → `pm2 reload`-or-`start`), wired into `all` and `npm run deploy:server`. **The deploy automation
> is dry-run-verified only**"*

and separately records brief 88 as *"closed without code: the user executed the deploy on real
hardware and confirmed it works."*

So: the wiki documents a pm2 + Caddy deploy, the repo contains a Docker/compose deploy that binds
`127.0.0.1:8787` with `restart: unless-stopped`, and neither the pm2 process definition nor the Caddy
reverse-proxy snippet exists in version control at all.

## Why it matters

- **The box cannot be re-derived.** If the VPS is lost or the Caddy config is hand-edited and drifts,
  nothing in the repo says how to rebuild it — no proxy rules, no process definition, no rsync/`npm ci`
  ordering.
- **No gate can ever assert anything about it**, which is exactly why
  [audit-40](2026-09-18-audit-40-dockerignore-strips-wasm.md) (the `.dockerignore` stripping the wasm
  the server reads) survived: the only committed deploy path is one nobody builds.
- **The "dry-run-verified" claim cannot be re-checked**, because the script it refers to is not here.

## The decision to make

There are two deploy stories and there should be one. Decide which, then make the repo say it:

1. **Docker/compose is the real path.** Then delete the pm2 + `deploy.ts` narrative from the corpus,
   commit the Caddy snippet that fronts the container, and fix
   [audit-40](2026-09-18-audit-40-dockerignore-strips-wasm.md) so the image is actually correct.
2. **pm2 + Caddy + `deploy.ts` is the real path.** Then commit it — the script, the Caddy snippet, the
   pm2 ecosystem file — and mark `infrastructure/` as superseded rather than leaving a second,
   contradictory answer in the tree.

The user has run a real deploy (brief 88), so the operative knowledge exists outside the repo. The
point of this brief is to get it **into** the repo; ask rather than reconstruct it from the wiki,
which is the thing already known to be stale.

## Files you OWN
- a `deploy/` directory (or `infrastructure/`, depending on the decision)
- [`infrastructure/Dockerfile`](../../infrastructure/Dockerfile), [`infrastructure/docker-compose.yml`](../../infrastructure/docker-compose.yml)
- [`wiki/status.md`](../wiki/status.md)'s deploy claims, and any wiki page describing hosting

## Files you must NOT touch
- **Do not run a deploy.** This brief commits and reconciles configuration; it does not touch the
  live VPS. Anything that would push, reload Caddy, or restart pm2 on real hardware needs the user's
  explicit go.
- secrets of any kind — if the real deploy needs an env file, commit an `.example` and document the
  variable names, never a value
- `briefs/` — frozen

## Acceptance
- One deploy story in the repo, and the corpus agrees with it.
- Whatever is committed is **readable as the source of truth**: someone (or some agent) could rebuild
  the box from the repo alone.
- The superseded path is deleted or explicitly marked, not left as a silent second answer.
- If anything remains unverifiable without real hardware, say so **in the file**, with what would
  verify it — the current "dry-run-verified only" note is the right instinct in the wrong place.
