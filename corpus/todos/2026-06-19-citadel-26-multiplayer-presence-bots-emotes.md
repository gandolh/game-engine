---
title: "Citadel 26 — Multiplayer + presence + NPC lobby bots + emotes (future epic)"
created: 2026-06-19
status: deferred
tags: [citadel, server, multiplayer, epic, gated]
---

# Citadel 26 — Multiplayer epic

**Lineage:** tiny-world-builder ships real multiplayer: PartyKit rooms; **presence** (ephemeral
cursor / active-tool state sent separately from durable `setCell` edits); **seeded-LCG NPC lobby
bots** (`lobby-bots.mjs`/`51-worlds-bots.js`) that join as invisible peers, move/chat via LLM
with graceful degradation, exponential-backoff reconnect, indistinguishable from humans;
**emotes** (`/wave /jump /dance` mapped to avatar animation, relayed to all peers); a lobby
screen with synced slides.

**Target:** large cross-cutting — Citadel client + a server + the command-queue substrate.

## Idea

Turn Citadel's MP-ready substrate into actual multiplayer: shared build/spectate of a citadel,
presence cursors, NPC bots populating rooms, emote/reaction relays.

## ⚠️ SCOPE / GATING — future epic, not a near-term brief

- APR **decision #14**: *single-player v1, MP-ready substrate; **do not** build netcode/lobby now; generalize `@farm/server` later if wanted.* This brief is explicitly **deferred** by that decision.
- The **cheap part is already true**: the deterministic **command-log IS the sync substrate** (same log → same state for every peer). The **expensive part** is netcode, presence channels, reconnect/backoff, NPC bots, and a lobby — a whole subsystem.
- **Out of scope for us regardless:** tiny-world's web3 **Phantom wallet + payments** and **Netlify identity auth**. If MP happens, reuse/generalize the existing `@farm/server` shared-run lobby (game brief 72), not a wallet.

## Next step

Needs its own **dedicated design + grilling** before any code — decompose into (a) command-log
fan-out over a socket, (b) presence channel, (c) NPC bots, (d) emotes/reactions, each its own brief.

## Acceptance (epic-level, once green-lit)

- Two+ clients drive one deterministic citadel via the shared command log; presence cursors visible; optional NPC bots; emote relays. Determinism (replay equivalence) preserved.
