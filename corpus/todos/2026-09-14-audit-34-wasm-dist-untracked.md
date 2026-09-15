# audit-34 — `engine/wasm-modules/dist/` is gitignored, but seven Node consumers read it

status: todo
created: 2026-09-14
context: found by [audit-29](closed/2026-09-13-audit-29-wasm-artifact-drift-check.md) while building the drift guard, and confirmed by the controller. It made the CI added in [audit-06](closed/2026-09-13-audit-06-ci-gate.md) fail on a fresh runner until a `build-wasm` step was added.

## The gap

CLAUDE.md and [decisions.md](../wiki/decisions.md) both say the wasm artifacts are committed so a
fresh clone does not need to build them. That is **half true**:

- `games/farm/client/public/wasm/*.wasm` — **tracked** (4 files). This is the browser copy.
- `engine/wasm-modules/dist/` — **gitignored** (`engine/wasm-modules/.gitignore` contains `dist/`,
  and always has; `git log --diff-filter=A` on that path is empty). **Not tracked.**

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

So on a genuinely fresh clone, `npm ci && npm run test` fails until `npm run build-wasm` has run —
contradicting the documented promise. It has gone unnoticed because nobody works from a truly clean
checkout: `dist/` persists locally once built.

## Consequences already observed

- CI (audit-06) had to gain a `npm run build-wasm` step to work at all.
- That step in turn **neuters audit-29's drift guard in CI**: the guard compares `src/*.ts` hashes
  against a manifest stored in `dist/`, so a step that rebuilds `dist/` regenerates the manifest and
  the check can never fail there. It remains effective locally.

## The decision to make

Pick one and record it in [decisions.md](../wiki/decisions.md):

1. **Track `dist/` (and its manifest).** Makes the documented promise true, makes the drift guard
   work in CI, lets the `build-wasm` CI step go away. Costs repo size and puts four more binaries
   under review.
2. **Point the Node consumers at the committed `public/wasm/` copy** instead of `dist/`. One tracked
   location, no new binaries, and the drift guard's location-comparison becomes the real invariant.
   Costs seven call-site changes and an odd-looking dependency (engine + tools reading a path under
   `games/farm/client/`).
3. **Keep `build-wasm` as a required bootstrap step** and fix the DOCS instead — CLAUDE.md and
   decisions.md stop claiming a clone needs no wasm build. Cheapest, but it makes every fresh
   environment slower and keeps the guard CI-blind.

Option 2 is probably cleanest if the odd path can be tidied (e.g. move the committed artifacts to a
neutral `engine/wasm-modules/artifacts/` that both the browser and Node read). **Do not just pick
one — check whether the browser build copies from `public/wasm/` at bundle time before moving
anything**, because that path is also a Vite public-dir contract.

## Files you OWN
- `engine/wasm-modules/.gitignore`, `build/compile.mjs`, `build/manifest.mjs`, `build/check-drift.mjs`
- the seven consumer call sites, if option 2
- `.github/workflows/ci.yml` (the `build-wasm` step, if it becomes unnecessary)
- `CLAUDE.md` + [decisions.md](../wiki/decisions.md) — whichever claim ends up true

## Files you must NOT touch
- the AssemblyScript sources
- audit-29's drift-check LOGIC (it is correct; this spec changes where its inputs live)

## Acceptance
- `git clone` + `npm ci` + `npm run test` passes with **no** manual wasm build, or the docs no longer
  claim it does — state which option was taken and why.
- audit-29's drift guard can FAIL in CI (demonstrate it), or it is explicitly recorded as
  local-only with the reason.
- The two artifact locations stay in sync, or there is only one.
