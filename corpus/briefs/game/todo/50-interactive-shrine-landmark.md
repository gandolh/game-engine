# Game Task 50 — Interactive shrine landmark (authored set-piece with light interaction)

## Context

Split out of [brief 49 track 6](49-organic-procgen-noise-and-authored-detail.md)
during implementation (2026-06-09). Track 6 shipped the **render-only decorative
open-water props** (seabed accents scattered by blue-noise, modeled on the coral
décor — see [render-systems/set-pieces.ts](../../../../packages/farm-valley/src/render-systems/set-pieces.ts)).
The other half of track 6 — an **authored landmark island the player asked to be
*interactive*** — was deferred here because "light interaction" turns it from
procgen polish into a real gameplay feature touching the BDI agent loop
(deliberate → act → perceive) + determinism, which deserves proper design rather
than being rushed into a render track. The brief itself anticipated this: tracks
4–6 "may each warrant their own follow-up brief once scoped."

## Goal

Add ONE distinctive authored landmark island — a **shrine** — that breaks the
archipelago's symmetry visually AND offers a small, bounded, occasional
interaction, without destabilizing the economy or determinism.

## Design (agreed during the brief-49 session)

- **A shrine island:** new entry in `REGIONS` (bounds + center) connected by a
  2-wide bridge in `ROADS`, sprited as a distinctive set-piece (standing stones /
  ruin / shrine — reuse existing atlas frames if possible; flag if a new frame is
  truly needed, since that's an atlas rebuild). Reachable, non-adjacent to other
  islands. Sits where it breaks the current cardinal symmetry.
- **The interaction — minimal & determinism-safe:** a `pray-at-shrine` act
  handler, **region-gated** (only resolves when the farmer is on the shrine) and
  **cooldown / one-time gated** so it can't be spammed, granting a **small bounded
  buff** (e.g. a one-time +AP or a minor skill nudge — pick a value that does NOT
  ripple the economy or create a leader-runaway; see [project_leader_runaway]).
- **Wiring:** one `deliberateShrineVisit` hook in **ONE** personality
  (opportunist is the natural fit — it already weighs detours), composed into its
  intention queue like the other `deliberate*` helpers. `PerceiveSystem` folds the
  shrine into beliefs. Travel routes to it via the existing land grid.

## Files in scope (verify before editing)

- `packages/farm-valley/src/world/regions.ts` — add the shrine region + bridge;
  update `walkable-grid.test.ts` + `regions.test.ts` (recompute counts, re-assert
  no-adjacency + BFS reachability — they already recompute, so just confirm).
- `packages/farm-valley/src/systems/act/` — new `pray-at-shrine` handler
  (region-gated, cooldown).
- `packages/farm-valley/src/agents/` — `deliberateShrineVisit` + opportunist hook.
- `packages/farm-valley/src/systems/perceive.ts` — shrine into beliefs.
- Component for the cooldown/one-time flag (mirror existing per-farmer cooldowns).
- Sprite/atlas: reuse a frame if possible; `npm run build-wasm` is NOT involved,
  but the atlas builder + `atlas.test.ts` guard are if a new frame is added.

## Determinism guarantee

This adds sim surface, so the full rigor applies: any randomness threads
`rng.fork(label)` (NEVER `Math.random`/`Date.now`); verify with
`CHECK_DETERMINISM=1` across `0xc0ffee/1/42` at **both** `TICKS_PER_DAY=20` and
1200 + `EXPORT=json` diffs ([project_mining_random_determinism] — default-tick is
where bombs hide). The buff must be deterministic and bounded.

## Acceptance

- `npm run typecheck` (all workspaces — confirm farm-valley package typechecks,
  not just the engine) + `npm run test` green; guard tests updated; palette + (if
  touched) atlas updated.
- Shrine reachable + non-adjacent; the interaction fires occasionally (not every
  day, not never) for the opportunist; buff is small and economy-neutral.
- `CHECK_DETERMINISM` MATCHes ×3 seeds at 20 AND 1200 ticks.
- world-generation.md + the relevant agent/systems wiki pages updated.

## Workflow

Opus plans the slice; Sonnet executes ([feedback_subagent_workflow]). Grill the
buff balance + which personality before building — a careless buff is exactly the
kind of thing that could wake the dormant leader-runaway dynamic
([project_leader_runaway], [project_peer_interaction_inert]). Do not commit until asked.
