# audit-26 — Three workers reimplement the tick pump and disagree on what "speed" means

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). **Contains a design decision**, not just a refactor — settle the semantics before writing the primitive.

## The duplication

Each Worker-based game hand-rolls the same `intervalId` / `setInterval` / `clearInterval` lifecycle plus a
`startLoop` / `postSnapshot` / `onmessage` switch around a `"ready"`/`"init"` handshake:

- [games/citadel/client/src/worker/sim-worker.ts:13-61](../../../games/citadel/client/src/worker/sim-worker.ts#L13-L61)
- [games/hollow/client/src/worker/sim-worker.ts:185-288](../../../games/hollow/client/src/worker/sim-worker.ts#L185-L288)
- [games/mathquest/client/src/worker/sim-worker.ts:116-135](../../../games/mathquest/client/src/worker/sim-worker.ts#L116-L135)

`grep -c setInterval engine/core/src` is **0** — there is no engine-level tick-pump primitive at all, so a
fourth continuous-sim game will produce a fourth variant.

## The divergence that matters more than the duplication

The three have silently settled on **different meanings for speed**:

- **Citadel** re-periodizes the interval: `const msPerTick = 1000 / (20 * speed)` inside `startLoop`
  ([:42](../../../games/citadel/client/src/worker/sim-worker.ts#L42)), and the `"speed"` case re-invokes
  `startLoop()` — tearing down and recreating the interval on every speed change.
- **Hollow** holds the period fixed at `BASE_MS_PER_TICK` and runs `speedMultiplier` ticks per fire; its
  own header says the interval is *"NEVER re-periodized by speed"*.

Citadel's clear-and-recreate discards the pending fire and schedules a fresh full period out, so changing
speed produces a one-off timing hitch exactly when the player is interacting with the speed control.
Hollow's design specifically avoids that. Nothing documents why they differ — so this is probably drift,
not two considered choices.

Note that determinism is unaffected either way: the sim depends only on tick *count*, and `setInterval` is
pacing only ([decisions.md](../../wiki/decisions.md) → Concurrency). This is a feel/correctness-of-pacing
question, not a sim-correctness one.

## Decide first, then build

1. Pick the model. Recommended: **Hollow's** — fixed period, variable batch size. It avoids the hitch and
   degrades more gracefully when a batch overruns its period.
2. Record the call in [wiki/decisions.md](../../wiki/decisions.md), including what happens when a batch cannot
   finish within one period (drop ticks? let it drift? cap the batch?) — that case is currently undefined in
   all three workers and is the thing that bites at high speed on weak hardware.
3. Then add `createTickPump({ hz, onTick })` (start / stop / isRunning, generic over logical-ticks-per-fire)
   to `@engine/core/runtime` and adopt it.

MateQuest should adopt the primitive **only if** [audit-03](2026-09-13-audit-03-mathquest-drop-snapshot-pump.md)
has not removed its pump entirely — check first; a turn-based game may end up needing no pump at all.

## Files you OWN
- new `engine/core/src/runtime/tick-pump.ts` + tests + the `/runtime` barrel entry
- the three workers' pump scaffolding
- a line in [wiki/decisions.md](../../wiki/decisions.md)

## Files you must NOT touch
- any `sim-core` tick logic — this is host pacing only
- Farm's client (it is WebSocket-driven; the server owns its clock). Adopt there only if it genuinely fits,
  and say so explicitly rather than forcing it.
- the engine must stay game-agnostic: no game names or game-specific speed tables in the primitive

## Acceptance
- One engine primitive; Citadel and Hollow both use it and now agree on speed semantics.
- **Citadel's speed-change hitch is gone** — demonstrate it: change speed repeatedly in a real browser
  (`npm run citadel`) and show tick cadence stays smooth. This is the user-visible payoff.
- Sim outcomes for a fixed seed are unchanged in both games (pacing must not touch tick accounting).
- The batch-overrun behaviour is defined, implemented and documented.
- `npm run test -w @engine/core`, `-w @citadel/client`, `-w @hollow/client` green.
