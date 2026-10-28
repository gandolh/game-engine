# package-lock.json drifts on every plain `npm install`

status: closed 2026-10-28 — already fixed by 48cb415; no lockfile change needed (npm version mismatch left for the owner)
created: 2026-10-09
context: found during the 2026-10-09 README refresh. Bug brief only; nothing was changed.

## What is wrong

On this machine a plain `npm install` rewrites `package-lock.json`, leaving a dirty tree with no real
dependency change. The three workspace manifests declare `"engines": { "node": ">=24" }` but the
committed lockfile has no `engines` entry for those workspaces, so npm adds them.

## Evidence (re-checked 2026-10-09)

- Declared: [`engine/core/package.json`](../../../engine/core/package.json),
  [`engine/ui/package.json`](../../../engine/ui/package.json) and
  [`engine/wasm-modules/package.json`](../../../engine/wasm-modules/package.json) each have
  `"engines": { "node": ">=24" }` near the top, as does the root `package.json`.
- Lockfile: the root entry (`""`) has `engines: { node: ">=24" }`, but the `engine/core`, `engine/ui` and
  `engine/wasm-modules` entries in `package-lock.json` have none.
- Node on this machine is v24.14.1, so the engines field itself is satisfied.

## Reproduce

1. Clean tree, `git status` empty.
2. `npm install`.
3. `git diff --stat package-lock.json` shows added `engines` blocks for the three `engine/*` entries.

## What to do

Regenerate the lockfile in one controlled commit that contains only that change: run `npm install`,
check `git diff package-lock.json` is limited to the `engines` additions (no version bumps, no
`resolved` churn), run the test gate, commit it alone. Don't hand-edit the lockfile.
Use the `packageManager` version from the root `package.json` (npm 11.4.2) so the format matches.

## Files you OWN
- `package-lock.json`

## Files you must NOT touch
- Any `package.json`, dependency versions (pins are exact), or workspace layout.

## Acceptance
- On a clean checkout, `npm install` leaves `git status` empty.
- The commit's diff is only the `engines` additions.
- `npm test` passes.

## Outcome (2026-10-28)

**Already fixed, nothing to commit.** The `engines` blocks for `engine/core`, `engine/ui` and
`engine/wasm-modules` went into `package-lock.json` with `48cb415` ("Security: clear the npm audit
findings", 2026-10-23), which regenerated the lockfile while bumping vite, vitest and the docs
packages. That is the only lockfile commit since this spec was filed.

Checked:

- **The machine's npm (11.19.1)**: a fresh `git clone` of `main` at `495ad13`, `npm install`
  twice, left `git status` empty both times. So did `npm install` in the working tree.
- **npm 11.4.2, the root `packageManager`**: `npx npm@11.4.2 install` in the working tree, and
  `--package-lock-only` in the fresh clone, both rewrite the lockfile: 38 `"libc"` arrays dropped
  from the platform-specific optional packages and `"peer": true` added to 26 entries (+26 / -114
  lines). No version or `resolved` changes. That is the drift this spec described, the other way
  round: the lockfile is now in 11.19.1's format, and 11.4.2 writes an older one.

The spec said to match `packageManager` (11.4.2) and not to touch any `package.json`. Regenerating
with 11.4.2 would put the drift back for anyone on the current npm, so the lockfile stays as it is.
**Owner question:** which npm is canonical? Bumping `packageManager` to `npm@11.19.1` would make the
field match the lockfile; pinning the machine to 11.4.2 would mean regenerating the lockfile with it.
Recorded on [open-questions.md](../../wiki/open-questions.md).

No test gate was run for this spec, because nothing changed; the full gates ran twice the same day
for the Citadel specs, before this `npm install`.
