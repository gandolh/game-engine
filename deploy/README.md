# Deploy

Zero-dependency Node + TypeScript deploy tool for the Farm Valley static build.
No `npm install` needed — it runs on Node's built-in TypeScript stripping
(Node ≥ 22.6) and shells out to `ssh` / `scp` / `rsync`, which you already have.

Farm Valley is a **static** Vite bundle: the ECS sim runs in a Web Worker in
the browser, so there is **no Node process on the server**. Caddy serves the
files; pm2 (which runs long-lived processes) isn't needed for this app.

## One-time setup

```bash
cp deploy/.env.example deploy/.env   # then edit deploy/.env
```

`deploy/.env` is git-ignored (it points at your server). `deploy/.env.example`
is the tracked template. SSH auth uses your key / `~/.ssh/config` — no passwords
or secrets live in the repo.

On the server, make your **main** `/etc/caddy/Caddyfile` import the per-project
snippets dir from inside the relevant site block, then create the dir:

```caddyfile
:80 {                      # or:  your-domain.example.com {
    import sites/*.caddy   # relative to the Caddyfile's directory
}
```

```bash
ssh hetzner 'sudo mkdir -p /etc/caddy/sites'
```

This is why deploying Farm Valley never touches other projects on the shared
VPS: `pre-deploy` only writes `sites/farm-valley.caddy` and reloads Caddy — it
never overwrites the main Caddyfile.

## Phases

| Phase        | What it does |
| ------------ | ------------ |
| `pre-deploy` | Provision: check SSH, verify Caddy is installed, ensure `REMOTE_DIR` exists (owned by the ssh user so rsync needs no sudo), upload the Caddy snippet, validate the main Caddyfile, reload Caddy. Run when the server is new or `deploy/Caddyfile` changed. |
| `deploy`     | Typecheck + test, build **locally** with the sub-path base baked in (`FARM_VALLEY_BASE`), verify the emitted `dist/`, then `rsync` `dist/` to the server as an exact mirror. Run on every release. |

## Usage

```bash
# Provision the server (first deploy, or after editing deploy/Caddyfile)
npm run deploy:pre

# Build + upload (the everyday command)
npm run deploy

# Both, in order
npm run deploy:all
```

Direct invocation with flags:

```bash
node deploy/deploy.ts deploy --no-build     # upload existing dist/ as-is
node deploy/deploy.ts deploy --skip-tests   # build without typecheck/tests
node deploy/deploy.ts pre-deploy --dry-run  # print actions, touch nothing
node deploy/deploy.ts --help
```

## sudo on the server

`pre-deploy` needs root to write the Caddy snippet, reload Caddy, and (if
needed) create `REMOTE_DIR`.

- `SUDO_NOPASSWD=true` — the tool runs the `sudo` commands over SSH directly.
- `SUDO_NOPASSWD=false` (default) — it **prints the exact command** for you to
  run on the server, then waits for confirmation. Avoids hanging on a password
  prompt over a non-interactive SSH channel.

## How the sub-path works

The build is parameterized by `FARM_VALLEY_BASE` (set from `BASE_PATH`):

- `vite.config.ts` reads it into Vite's `base`, so every emitted asset URL is
  rooted under `/farm-valley/`.
- Runtime fetches that Vite can't rewrite (the pathfinder/noise WASM and the
  atlas index) are resolved against `import.meta.env.BASE_URL` in the app, and
  the engine atlas loader prefixes the base onto its root-absolute URLs.
- Caddy's `handle_path /farm-valley/*` strips the prefix, so files sit at the
  root of `REMOTE_DIR`; `try_files … /index.html` keeps the SPA working on
  refresh/deep-link.

`deploy` asserts `dist/index.html` references `/farm-valley/assets/` before
uploading, so a base mismatch fails fast instead of shipping a broken bundle.

## Files

- `deploy.ts` — the tool (tracked).
- `Caddyfile` — the per-project Caddy snippet, uploaded by `pre-deploy` (tracked).
- `.env.example` — config template (tracked).
- `.env` — your real config (git-ignored).
