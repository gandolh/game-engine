# Game Task 17 — Save / Replay + Shareable Run

## Context

[architecture.md](../../../wiki/architecture.md) and [decisions.md](../../../wiki/decisions.md) both state the save model is **"seed + event-sourced input log, not snapshots."** The infrastructure exists: `packages/engine/src/persistence/event-log.ts`, `packages/engine/src/runtime/input-log.ts`, and a deterministic seeded `Rng`. But the feature is **dead** — `main.ts` instantiates `const inputLog = new InputLog()` and immediately discards it with `void inputLog;`. Nothing is ever recorded, saved, or replayed.

Because the sim is fully deterministic, a run is *completely* described by `{ seed, maxDays, ticksPerDay }` plus any external inputs. Today there are no mid-sim external inputs that affect the sim (the viewer only pans/zooms/focuses, which are presentation-only), so a run is reproducible from seed alone. This makes "share this run" almost free — and sets up the architecture for when interactive inputs do land.

## Goal

1. **Capture run descriptor**: on Start, record `{ seed, maxDays, ticksPerDay }`. If/when any sim-affecting external input exists, append it to the `InputLog` with its tick (wire `InputLog` for real instead of `void`-ing it).
2. **Share**: a "Share this run" button (on the game-over screen and/or a small control) that serializes the run descriptor into a URL hash (e.g. `#run=<base64>`), copyable to clipboard.
3. **Load**: on boot, if the URL hash contains a run descriptor, use it instead of the hardcoded defaults — same seed → byte-identical run.
4. **Replay mode (minimum viable)**: loading a shared run replays it deterministically from tick 0. (Fast-forward via Brief 16's speed control is a natural pairing, not a hard dependency.)

## Files in scope

- `packages/farm-valley/src/main.ts` — stop `void`-ing `inputLog`; wire it. Read the run descriptor from the URL hash on boot; fall back to defaults. Pass seed/maxDays/ticksPerDay through to `bootstrapSim`.
- `packages/farm-valley/src/run-descriptor.ts` — NEW: `serializeRun(desc): string` / `parseRun(hash): RunDescriptor | null`, and the `RunDescriptor` type. Pure functions, fully unit-testable.
- `packages/farm-valley/src/run-descriptor.test.ts` — NEW: round-trip tests (serialize→parse is identity; malformed hash → null).
- `packages/farm-valley/src/screens/game-over.ts` (or wherever the game-over panel lives — grep `renderGameOver`) — add a "Share this run" button that writes the URL hash + copies to clipboard. Show the seed (e.g. "Run #c0ffee").
- `packages/engine/src/persistence/event-log.ts` / `packages/engine/src/runtime/input-log.ts` — ALLOWED only if a tiny serialization helper is missing. Read them first; prefer using the existing API.

## Files you must NOT touch

- `systems/**`, `agents/**` — the sim must remain deterministic and unaware of save/load.
- `world/**`, `world-setup.ts`, `components.ts`, `protocols/**`.
- `render-systems.ts`, other `ui/**` panels.

## Dependencies / coordination

- Pairs naturally with **Brief 18 (seed picker)** — both read/write the run descriptor + seed. If both run in parallel, agree that `run-descriptor.ts` is the single source of the `RunDescriptor` type and seed plumbing; 18 owns the home-screen input, 17 owns serialization + game-over share.
- **Brief 16 (playback)** is a nice-to-have for replay fast-forward but not required.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (new run-descriptor round-trip tests)
- `npm run dev`: finishing a run shows a "Share this run" button; clicking it copies a URL; opening that URL reproduces the identical run (same final leaderboard)
- `inputLog` is no longer dead code (`void inputLog;` removed)
- No `.js` import suffixes; no new runtime deps

## Workflow

You're the sonnet executor. Read this brief, then `main.ts` (the `InputLog` + bootstrap region), the persistence/input-log engine files, and the game-over screen. Implement. Run typecheck + tests before reporting done. Report files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
