# package-lock.json drifts on every plain `npm install`

status: todo
created: 2026-10-09
context: found during the 2026-10-09 README refresh. Bug brief only; nothing was changed.

## What is wrong

On this machine a plain `npm install` rewrites `package-lock.json`, leaving a dirty tree with no real
dependency change. The three workspace manifests declare `"engines": { "node": ">=24" }` but the
committed lockfile has no `engines` entry for those workspaces, so npm adds them.

## Evidence (re-checked 2026-10-09)

- Declared: [`engine/core/package.json`](../../engine/core/package.json),
  [`engine/ui/package.json`](../../engine/ui/package.json) and
  [`engine/wasm-modules/package.json`](../../engine/wasm-modules/package.json) each have
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
