# audit-34 — Make `engine/wasm-modules/dist/` the tracked, canonical artifact location

status: closed 2026-09-15
created: 2026-09-14
ruled: 2026-09-15 (grill-me session) — the option is chosen; see **The ruling**. Do not re-open it.
context: found by [audit-29](2026-09-13-audit-29-wasm-artifact-drift-check.md) while building the drift
guard. It made the CI added in [audit-06](2026-09-13-audit-06-ci-gate.md) fail on a fresh runner until a
`build-wasm` step was added — which in turn blinded audit-29's guard in CI.

## The gap

CLAUDE.md and [decisions.md](../../wiki/decisions.md) both say the wasm artifacts are committed so a
fresh clone does not need to build them. That is **half true**:

- `games/farm/client/public/wasm/*.wasm` — **tracked** (4 files). The browser copy.
- `engine/wasm-modules/dist/` — **gitignored** (`engine/wasm-modules/.gitignore` contains `dist/`,
  and always has). **Not tracked.**

But `dist/` is what every Node-side consumer reads:

```
engine/core/src/wasm/pathfinder.test.ts
games/farm/server/src/index.ts                      <- the production server
games/farm/server/src/sim-host.test.ts
games/farm/sim-core/src/systems/travel.test.ts
games/farm/sim-core/src/world/pathfinder-equivalence.test.ts
tools/run-sim/src/pathfinder.ts
tools/run-sim/src/probes/probe-travel-nopath.ts
```

So on a genuinely fresh clone, `npm ci && npm run test` fails until `npm run build-wasm` has run.
It goes unnoticed because `dist/` persists locally once built.

## The ruling

**Track `engine/wasm-modules/dist/`.** Both alternatives were considered and refused:

- **Rejected — point the Node consumers at `public/wasm/`.** `@engine/wasm-modules`'s `exports` map
  resolves `"./pathfinding.wasm": "./dist/pathfinding.wasm"`. **`dist/` IS the published package's
  export surface.** Consuming a different path would make the repo exercise something the package
  does not ship, so a broken `exports` map would pass every local test. The repo must read what
  consumers read.
- **Rejected — keep `build-wasm` as a bootstrap step and fix the docs.** Cheapest, but it leaves
  audit-29's drift guard permanently CI-blind, which was the point of building it.

The cost objection that made the original spec hesitate collapses on measurement: the four `.wasm`
files total **3.8 KB** (pathfinding 1671, floodfill 836, noise 671, rng 603). This was never a
repo-size question.

**`games/farm/client/public/wasm/` stays tracked too, and is not a redundant duplicate.**
[main.ts:52](../../../games/farm/client/src/main.ts#L52) loads
`${import.meta.env.BASE_URL}wasm/noise.wasm` at runtime — a Vite **public-dir URL contract**, so the
file must physically sit under `games/farm/client/public/`. **Do not move, symlink, or consolidate
it.** Two locations stay; `dist/` is canonical; audit-29's location-comparison check is what keeps
them honest, and that check becomes load-bearing rather than redundant.

## What to do

1. **Replace `engine/wasm-modules/.gitignore`'s blanket `dist/`** with a rule that tracks
   `dist/*.wasm` and `dist/manifest.json` (the drift guard's input) and ignores `dist/*.wat` — ~31 KB
   of generated WebAssembly text dumps with no consumer.
2. `git add` the four `.wasm` files and `manifest.json`.
3. **Remove the `npm run build-wasm` step from [.github/workflows/ci.yml](../../../.github/workflows/ci.yml)**
   (~lines 39-57), including the comment block that explains why it was needed — that explanation is
   now wrong and would mislead.
4. **Update CLAUDE.md's WASM paragraph** so the "fresh clones don't need to build wasm" promise is
   true without qualification. [decisions.md](../../wiki/decisions.md) → *WASM* is already rewritten
   with this ruling; align CLAUDE.md to it, don't re-word the decision.
5. **Drift is a hard CI failure, not a warning.** Editing an AssemblyScript kernel becomes a two-step
   commit: change the source, `npm run build-wasm`, commit both. Deliberate — those kernels change
   roughly never, and a silent divergence between a committed binary and its source is exactly what
   audit-29 exists to catch.

## Files you OWN
- `engine/wasm-modules/.gitignore`
- `.github/workflows/ci.yml` — the `build-wasm` step only
- `CLAUDE.md` — the WASM paragraph only
- the newly tracked `engine/wasm-modules/dist/` artifacts

## Files you must NOT touch
- the AssemblyScript sources in `engine/wasm-modules/src/`
- audit-29's drift-check LOGIC (`build/check-drift.mjs`) — it is correct; this spec only changes
  where its inputs live
- the seven consumer call sites — they already read the right place
- `games/farm/client/public/wasm/` — Vite public-dir contract
- [decisions.md](../../wiki/decisions.md) — the ruling is already recorded there

## Acceptance
- **Demonstrate** `npm ci && npm run test` passing with **no** manual wasm build. A fresh clone into a
  temp dir is the honest test; do not assert it from a warm tree.
- **Demonstrate audit-29's drift guard can now FAIL in CI.** Edit a kernel source without rebuilding,
  confirm `npm run test -w @engine/wasm-modules` goes red, then revert. This is the whole point of the
  spec — an untested claim here fails the acceptance.
- `git status --porcelain` is clean after `npm run build-wasm` on an unmodified tree (proves the
  committed artifacts match a fresh build byte-for-byte).
- No `.wat` file is tracked.
- `npm run typecheck` green.
