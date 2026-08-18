# hollow-02 — promote the generic agent kernel into @engine/core

status: todo
milestone: M1
depends-on: hollow-01
created: 2026-07-17

## Goal
Lift Farm's game-agnostic agent machinery up into `@engine/core` so Hollow reuses it without a
cross-game import, and Farm becomes thinner. This is the "isolate the two games" work: shared
mechanics stop living inside one game. **The bar is behavior-preserving for Farm**, proven by
multi-seed data diffs — not just a determinism check.

## What to promote (game-agnostic only)
Survey the actual code first; likely targets under `games/farm/sim-core/src/`:
- **Deliberate-registry pattern** (`agents/registry.ts`) — the `personality.kind → deliberate
  fn` dispatch, generalized to a reusable registry keyed by personality kind.
- **FSM PERCEIVE→ACT loop** — the generic perceive/act cycle + `busyUntil` arming/clearing
  (`systems/cognition`, the perceive/act scheduling), stripped of farming nouns.
- **Needs / decay** — a generic depleting-need component + decay system (Farm's `skills`/need
  handling is the seed; keep the mechanism, drop crop-specific bits).
- **Contract-Net trade** — the generic CNP protocol (`protocols/`, `systems/encounter-trade`,
  peer-trade policy/registry) as a reusable trade kernel over the message bus.
- **Trust / relationship primitives** — the pairwise trust/rivalry ledger + update rules
  (`systems/rivalry`, trust bits of `systems/social`), generalized to a relationship component
  the engine owns.
- The message-bus + inbox lifecycle is **already** in `@engine/core/sim` — reuse as-is.

Anything with a Farm-specific noun (crop, harvest, festival, harbor, weather-station) **stays in
`@farm/sim-core`**. When in doubt, leave it in Farm.

## Approach
1. Read the target modules; draw the generic/Farm-specific line explicitly in the brief's
   working notes before moving code.
2. Move generic code to new `@engine/core` subpaths (e.g. `@engine/core/agent`) with
   game-neutral names. Keep the BDI components where they already are (`@engine/core/ecs`).
3. Refactor `@farm/sim-core` to import the promoted kernel; delete the moved originals. No
   behavior change intended.
4. Add engine-level unit tests for the promoted kernel in isolation (needs decay, CNP round,
   trust update, registry dispatch).

## Acceptance / gates (STRICT — this touches a shipping game)
- **Farm determinism preserved:** run Farm headless on ≥3 seeds with `EXPORT=json` before and
  after; assert byte-identical exports. (Use the fast 3-day/3-seed diff per project convention;
  a full `CHECK_DETERMINISM` only if the diff is clean and the user approves — respect the
  constrained-hardware + ask-before-determinism-check rules.)
- `npm run typecheck` + `npm run test -w @engine/core` + `npm run test -w @farm/sim-core` green.
- `@engine/core` still names no game (grep the promoted files for Farm nouns → none).
- Promoted modules have their own engine tests (not only exercised via Farm).

## Risk notes
- This is the highest-regression-risk brief in M1. Prefer many small verified moves over one
  big move. Route the tricky adjudication (what is truly generic) to the controller; the
  mechanical moves can go to a junior executor per the routing policy.
- Do NOT let a subagent run `git reset`/`checkout`; commit per verified move.
