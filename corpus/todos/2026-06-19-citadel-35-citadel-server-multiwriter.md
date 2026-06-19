---
title: "Citadel 35 — @citadel/server multi-writer netcode foundation"
created: 2026-06-19
status: open
tags: [citadel, server, netcode, multiplayer, determinism]
---

# Citadel 35 — @citadel/server (multi-writer)

**Spine position: H (needs [28](2026-06-19-citadel-28-playerstate-refactor.md)).**
The netcode foundation of the
[Citadel MP epic](closed/2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md).

**Lineage:** the FV server [`@farm/server`](../../packages/server/) ships a
`RunRegistry` + `SimHost` (one host per run-key, encode-once snapshot fan-out, owner /
late-join / reconnect). We reuse the **pattern**, not the code: it
`import`s `@farm/sim-core` (FV-coupled) and is **owner-writes / spectators-watch only.**

## Idea / Scope

A **new `@citadel/server`** copying the RunRegistry/SimHost pattern but with a
**multi-writer** authoritative command-log.

- **Server-authoritative SINGLE sim per room.** Every peer **sends** commands; the server
  **stamps each at the current tick** into ONE authoritative command-log, advances the sim,
  and **fans out encoded snapshots** (encode-once). Clients are renderers that can also
  submit commands.
- **Multi-writer variant:** unlike `@farm/server` (owner-only writes), the command-log
  accepts commands from **all peers**, ordered by server arrival → tick-stamp. This is the
  key difference from the FV host.
- **Citadel client WS transport** replaces the in-browser Worker: instead of posting
  commands to a local Worker and reading snapshots back, the client opens a WebSocket to
  the room host, sends commands, receives encoded snapshots. (`bootstrapSim` stays
  Worker/transport-agnostic; transport lives at the edge.)
- Keep the FV host's **owner / late-join / reconnect** machinery (a late joiner gets the
  current snapshot + can begin submitting commands).

## Decisions (grilled 2026-06-19)

- **Netcode = server-authoritative SINGLE sim per room.** Every peer SENDS commands; server
  stamps each at the current tick into ONE authoritative command-log, advances the sim, fans
  out encoded snapshots. Clients are renderers that can also submit commands. Determinism
  preserved (one sim, one ordered log).
- **Reuse the FV `@farm/server` `RunRegistry`/`SimHost` *pattern*** (one host per run-key,
  encode-once fan-out, owner/late-join/reconnect) — **BUT that code is FV-coupled (imports
  `@farm/sim-core`) and is owner-writes / spectators-watch only**, so build a **NEW
  `@citadel/server` with a MULTI-WRITER variant.**
- **The command-log is the sync + save substrate** — same ordered log → same state for every
  peer and on replay. No `Math.random`/`Date.now` in sim.

## Acceptance

- `@citadel/server` runs one authoritative sim per room; all peers submit commands; the
  server tick-stamps them into one ordered log, advances, and fans out encoded snapshots.
- A late joiner receives current state and can submit commands; reconnect works.
- The Citadel client drives the sim over WS instead of a Worker; `bootstrapSim` stays
  transport-agnostic.
- **Determinism gate:** the same command-log replays byte-identically across peers/restart.
  Multi-seed / replay-equivalence proof — **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Dependencies / sequence

- **Depends on:** [28](2026-06-19-citadel-28-playerstate-refactor.md) (A).
- **Unblocks:** [36 presence-roster-emotes](2026-06-19-citadel-36-presence-roster-emotes.md) (I),
  [37 npc-lobby-bots](2026-06-19-citadel-37-npc-lobby-bots.md) (J).

## Open tuning (resolve in-brief)

Command-arrival ordering / tie-break at identical tick; max peers per room; snapshot
encoding reuse vs Citadel-specific encoder.
