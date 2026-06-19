---
title: "Engine — reuse per-tick transport queue buffers (CommandQueue + MessageBus)"
created: 2026-06-19
status: open
tags: [engine, sim, perf]
---

# Engine — reuse per-tick transport queue buffers

Two engine transport paths allocate every tick where the [MessageBus](../../engine/core/src/sim/message-bus.ts)
already shows the zero-alloc swap-buffer pattern to copy. Bring them in line.

## Context

- **`CommandQueue.drain()` copies the pending array every tick.**
  [command-queue.ts:32](../../engine/core/src/commands/command-queue.ts#L32) does
  `const batch = this.pending.slice();`. `CommandSystem.run()` calls it once per
  tick → a fresh array allocation per tick even when empty. Replace with the
  swap-buffer dance the message bus already uses in
  [message-bus.ts:38-43](../../engine/core/src/sim/message-bus.ts#L38) (`flush()`
  swaps `inflight`↔`deliverable` and resets `length = 0` — zero allocation).

- **`MessageBus.send()` spreads a new object per message.**
  [message-bus.ts:32](../../engine/core/src/sim/message-bus.ts#L32) does
  `this.inflight.push({ ...message, tickIssued });` — a fresh object per send to
  attach `tickIssued`. Lower priority (a freelist of `QueuedMessage` objects is
  more involved than the array swap), but it's the same class of hot-path churn.
  Worth a freelist only if profiling shows message volume matters.

Both are **transport-only → determinism-safe**, but per the root [CLAUDE.md](../../CLAUDE.md)
re-verify with the fast 3-day/3-seed `EXPORT=json` diff anyway (behavior must be
byte-identical — these are *how* state moves, not *what* it computes).

Caveat: per the wiki, the sim tick is ~0.7% of its 50 ms budget at current scale,
so this is GC-pressure hygiene, not a throughput fix — it matters most when many
SimHosts share one Node process (Farm server) and as Citadel MP scales.

## Acceptance

- `CommandQueue.drain()` no longer allocates per call (swap-buffer like `flush()`).
- Multi-seed `EXPORT=json` byte-identical before/after; typecheck + targeted tests green.
- MessageBus freelist deferred unless a profile justifies it (note the decision).
