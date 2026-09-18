# audit-50 — audit-18's promoted interpolation buffer has zero consumers; adopt it or delete it

status: todo
created: 2026-09-18
context: found independently by the undone-work and debt lenses of the 2026-09-18 sweep. An audit that
promotes a class nobody adopts has added a copy, not removed one.

## The gap

[audit-18](closed/2026-09-13-audit-18-engine-render-interpolation-promotion.md) promoted a generic
snapshot-interpolation buffer into `@engine/core/render` and sketched adopting it in Hollow first,
then Farm. The **free functions** landed and are used (`lerp`, `computeSnapshotAlpha`,
`lerpEntityPositions`). The **stateful class did not.**

`grep -rnw SnapshotInterpBuffer` across `engine games tools` returns exactly three places: its own
definition ([`snapshot-interp.ts:106`](../../engine/core/src/render/snapshot-interp.ts#L106)), its own
test, and the barrel line ([`render/index.ts:31`](../../engine/core/src/render/index.ts#L31)). No game
imports it. `clampAlpha` is likewise exported with zero call sites.

All three clients kept their own:

- [`games/hollow/client/src/render3d/interp.ts:71`](../../games/hollow/client/src/render3d/interp.ts#L71) — `class SnapshotBuffer` with the same `prev`/`latest`/`latestAtMs`/`intervalMs` bookkeeping; its `ingest` is line-for-line the engine class's. It imports the two helpers from the engine and reimplements the buffer around them.
- [`games/farm/client/src/net/sim-client/client.ts:43-53`](../../games/farm/client/src/net/sim-client/client.ts#L43-L53) — inline in `SimClient`.
- [`games/citadel/client/src/render/entity-interp.ts`](../../games/citadel/client/src/render/entity-interp.ts) — deliberately separate, and audit-18 said so. **Leave Citadel alone.**

And the three render delays disagree with nothing recording why: Farm `2 * msPerTick`, Citadel
`RENDER_DELAY_INTERVALS = 1.5`, Hollow `0`. The engine class's `delayMs` parameter is never passed by
anyone.

## The decision to make

**Adopt or delete. Do not leave it.** An engine class with no caller is worse than the duplication it
was meant to remove: it ships in the published `@engine/core` tarball as maintained, tested, documented
API, so the next game reads the barrel, assumes it is the source of truth, and gets smoothing that
matches none of the three shipped games.

1. **Adopt in Hollow, then Farm.** What audit-18 intended. Hollow is close to a pure deletion — its
   only addition is `interpolatedTick`, which composes from `alpha()`. Farm is more work because the
   buffer is entangled with `SimClient`'s transport.
2. **Delete the class, keep the helpers.** Also honest: the helpers *were* the reusable part, and
   three clients independently chose to own their buffer, which is evidence rather than an accident.

Whichever you pick, **record what the three divergent render delays mean.** If they are deliberate
(3D orbit vs 2D pan vs iso may genuinely want different smoothing) that is a finding worth writing
down; if they are drift, converge them.

## Files you OWN
- [`engine/core/src/render/snapshot-interp.ts`](../../engine/core/src/render/snapshot-interp.ts) + its test + the barrel
- [`games/hollow/client/src/render3d/interp.ts`](../../games/hollow/client/src/render3d/interp.ts)
- [`games/farm/client/src/net/sim-client/client.ts`](../../games/farm/client/src/net/sim-client/client.ts) — only if adopting

## Files you must NOT touch
- [`games/citadel/client/src/render/entity-interp.ts`](../../games/citadel/client/src/render/entity-interp.ts)
  — audit-18 already ruled it deliberately separate; do not relitigate
- the three helpers — they are adopted and working
- `@engine/core`'s export surface **shape**: if you delete, remove it from the barrel too, and
  remember `pack-smoke` / `examples/library-consumer` exercise the published surface

## Acceptance
- If adopting: `grep -rnw SnapshotInterpBuffer` shows real game importers; the per-game buffer classes
  are gone; **each adopting client is visually unchanged** — same delay, same snap-don't-extrapolate
  behaviour. Browser-verify Hollow's 3D town and Farm's farmers, because "the tests pass" is exactly
  the evidence this repo has twice recorded as insufficient for render work.
- If deleting: the class and `clampAlpha` are gone from source, test and barrel; `npm run pack-smoke`
  green.
- Either way the render-delay question is answered in writing, in
  [`wiki/architecture.md`](../wiki/architecture.md) or the closeout.
