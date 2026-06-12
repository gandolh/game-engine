# Brief 82 — Moving agents appear to teleport: widen snapshot interpolation beyond farmers

**Status:** Todo · **Area:** `packages/sim-core` (snapshot-builder/sprites.ts) + `packages/farm-valley` (worker/sim-client) · **Drafted:** 2026-06-12

**Symptom (user-reported 2026-06-12):** moving agents visibly snap tile-to-tile ("teleport") instead of gliding.

The interpolation pipeline itself exists and is sound: [interp.ts](../../../../packages/farm-valley/src/worker/sim-client/interp.ts) provides `lerp` + `smoothstep` easing, and [client.ts](../../../../packages/farm-valley/src/worker/sim-client/client.ts) keeps the prev+current snapshot pair, renders 2 ticks in the past, and lerps any sprite with `interpolate: true` + a stable `id`. The gap is **who gets the flag**: [sprites.ts:238](../../../../packages/sim-core/src/snapshot-builder/sprites.ts) sets `interpolate: isFarmer`, where `isFarmer = entity.farmer !== undefined` (line 119). Every other tile-stepping mover ships `interpolate: false` and therefore snaps one full tile per movement step.

Suspect movers (verify each actually snaps before fixing): **working NPCs** (brief 44 — note [work-npc.ts:11-12](../../../../packages/sim-core/src/systems/work-npc.ts) *says* NPC movement should "flow through the same prev/next interpolation as farmers", so either they carry a `farmer` component or the intent silently doesn't hold — check), **livestock** (brief 42), **boats** (brief 48), **ambient life** (brief 68). Out of scope: client-side render-only decor (ducks/whales in [water-decor.ts](../../../../packages/farm-valley/src/render/water-decor.ts)) — those move per-frame on the client and can't snap.

## Read first
- [snapshot-builder/sprites.ts](../../../../packages/sim-core/src/snapshot-builder/sprites.ts) — `isFarmer` (L119), `interpolate: isFarmer` (L238), and whether `id` is non-null for the suspect movers (interpolation requires a stable id; `prevById` drops id-less sprites).
- [worker/sim-client/client.ts](../../../../packages/farm-valley/src/worker/sim-client/client.ts) — the lerp path, `prevById`, the 2-tick render delay, and the brief-66 hidden-tab snap (intentional — must keep snapping on tab re-show).
- [systems/work-npc.ts](../../../../packages/sim-core/src/systems/work-npc.ts) — the stated interpolation intent for NPCs.
- [client.visibility.test.ts](../../../../packages/farm-valley/src/worker/sim-client/client.visibility.test.ts) — existing interp-adjacent tests to extend.

## Tasks
- [ ] **1. Reproduce + scope.** In the live game (worker mode and, if cheap, WS-client mode), confirm exactly which movers snap. Check whether work NPCs have `entity.farmer` (if yes, they already interpolate and the complaint is livestock/boats/other).
- [ ] **2. Widen the flag.** Replace `interpolate: isFarmer` with a predicate meaning "tile-stepping mover with a stable id" — farmers + work NPCs + livestock + boats (whatever task 1 confirms). Prefer deriving from a component the movers share (e.g. has `transform` + a movement component) over an enumerated type list, so the next mover species doesn't regress.
- [ ] **3. Teleport guard.** Widening the flag means genuine discontinuities (region travel/ferry, boat boarding, festival warp, day-reset repositioning) would now smear across the screen as a fast lerp. Add a max-lerp-distance clamp in the client lerp path (e.g. prev→current distance > ~2 tiles → snap to current, no lerp). This also hardens farmers, who likely already smear on travel today.
- [ ] **4. Verify.** Unit-test the clamp + the widened predicate (extend the sim-client tests). Visual check is the user's. Render-only by construction — the `interpolate` field is consumed only by the client — but confirm the snapshot-builder change doesn't touch any analytics/export path (grep consumers); no baseline move expected, **no determinism run needed** (per the resource rule, ask before running one anyway).

## Acceptance
- All sim-side movers glide between tiles like farmers do; none teleport during normal movement.
- Genuine jumps (travel, boarding, tab re-show) still snap cleanly — no cross-map smearing.
- typecheck + suites green; no sim-outcome baseline change.

## Risks / notes
- Sprites without a stable `id` can't interpolate (`prevById` keyed by id) — if a suspect mover has `id: null`, giving it one is part of the fix; make sure ids don't collide with entity ids.
- The brief-66 hidden-tab behavior (drop the snapshot pair → snap on re-show) is intentional; the teleport guard must not be "fixed" into lerping across hidden intervals.
- Frame-to-frame cost is unchanged (lerp already runs per interpolated sprite); the only growth is the number of flagged sprites — negligible at current entity counts.
