# Game Task 23 — Fifth Personality or Asymmetric Shock (variance injector)

> **Resolved 2026-05-29 — Direction B (mid-game shock) chosen.** Implemented a
> one-time **blight** via `systems/shock.ts` (`ShockSystem` + `defaultShockDay`).
> It fires once on the run midpoint (`floor(maxDays/2)`, configurable), wiping
> every planted plot of a deterministically-chosen farmer, and broadcasts
> `ONT_SIMULATION.SHOCK`. Determinism: target picked via `rng.fork("shock")`.
> Refinement during build: the target is chosen *among farmers who actually have
> planted crops* (fallback to any farmer only if none do) — an early version
> whiffed on ~5/8 seeds because it could strike a farmer with nothing planted,
> which isn't a "moment". Now lands every run (1–4 plots wiped across seeds).
> Wired on-by-default in `sim-bootstrap.ts` (`shock?: false | {...}` to disable/
> tune); `run-sim` narrates it. Direction A (fifth personality) was NOT taken.

## Context

[open-questions.md](../../../wiki/open-questions.md) records the design stance: *"no balance work, moments matter"* — Atticus consistently winning is coherent narrative, not a bug. So this brief is **design-gated**: only schedule it if runs start feeling same-y across seeds. Its purpose is to inject variance and create *moments*, not to balance the economy. Two alternative directions are offered; pick ONE when the brief is activated.

## Goal (pick ONE direction at activation time)

### Direction A — Fifth personality
Add a new BDI personality that changes the social dynamics — e.g.:
- a **saboteur** who posts lowball decoy offers or breaks CNP commitments to depress trust, or
- a **cooperator** who actively props up a struggling neighbor (sells seeds at cost to the last-place farmer).

Either creates new inter-agent stories. Must register through the same `Personality`-tag dispatch as the existing four, with its own `agents/<name>.ts`, beliefs/desires logic, respond hooks, and tests.

### Direction B — Mid-game asymmetric shock
A random (seeded) one-time event around the midpoint that reshuffles the standings — e.g. a **market crash** (crop prices halve for K days), a **blight** (one random farmer's planted crops are wiped), or a **windfall** (a random farmer finds gold). Surfaced loudly in the event feed (Brief 20). Deterministic on seed; tunable magnitude.

## Files in scope

### If Direction A (fifth personality)
- `packages/farm-valley/src/agents/<new-name>.ts` — NEW personality module (mirror the structure of `opportunist.ts` / `hoarder.ts`).
- `packages/farm-valley/src/agents/<new-name>.test.ts` — NEW behavior tests.
- `packages/farm-valley/src/sim-bootstrap.ts` — add a `FarmerSpec` for the new farmer (home tile, start gold/seeds, region). Note: the world has 4 farm regions today — adding a 5th farmer needs a region decision (share the village, or add a region in `world/regions.ts`). Flag this at activation; it may pull in a small `world/` change.
- `packages/farm-valley/src/agents/conservative.ts` import side-effect list — register the new personality (follow how the four are imported in `sim-bootstrap.ts`).

### If Direction B (shock)
- `packages/farm-valley/src/systems/shock.ts` — NEW system that, on a seeded schedule, applies the shock once and broadcasts it.
- `packages/farm-valley/src/systems/shock.test.ts` — NEW: shock fires deterministically for a seed; magnitude correct; fires exactly once.
- `packages/farm-valley/src/sim-bootstrap.ts` — register the shock system.
- (Pairs with Brief 20 event feed for surfacing.)

## Files you must NOT touch

- The other personalities' decision logic (Direction A should create dynamics through interaction, not by rewriting Cora/Atticus/Hannah/Otto).
- `protocols/**` unless a genuinely new message type is required (prefer reusing existing ontologies).
- `render-systems.ts`, engine source.
- `components.ts` unless the chosen direction strictly needs a new field (read first).

## Determinism note

Whichever direction: all randomness via the seeded `Rng` named forks, keyed on day/tick. The shock timing/target or the fifth farmer's choices must be reproducible for a seed. No `Math.random`, no `Date.now`.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (new tests for the chosen direction)
- `npm run sim` over several seeds shows more varied standings / new emergent moments than before, without breaking determinism (same seed still reproduces)
- No `.js` import suffixes; no new runtime deps

## Workflow

You're the sonnet executor. **Do not start until the orchestrator picks Direction A or B** (this brief is design-gated). Then read this brief, the relevant existing files for the chosen direction, and implement. Run typecheck + tests + a multi-seed `npm run sim` sanity check before reporting done. Report files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
