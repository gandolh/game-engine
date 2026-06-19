---
title: "Citadel 37 — Seeded NPC lobby bots"
created: 2026-06-19
status: open
tags: [citadel, server, multiplayer, bots, flavor]
---

# Citadel 37 — NPC lobby bots

**Spine position: J — last in the spine (needs
[35](2026-06-19-citadel-35-citadel-server-multiwriter.md),
[36](2026-06-19-citadel-36-presence-roster-emotes.md)).**
Flavor finale of the
[Citadel MP epic](closed/2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md). Absorbs the
bot scope from the superseded brief 26.

**Lineage:** tiny-world-builder's seeded-LCG NPC lobby bots (`lobby-bots.mjs`/
`51-worlds-bots.js`) join as peers, move/chat, reconnect with backoff, and read as humans.

## Idea / Scope

Seeded NPC bots that **join a room as peers** to populate lobbies and fill out matches.

- Bots connect through the same `@citadel/server` peer interface as humans (brief 35) —
  they submit commands into the authoritative log, show up in the roster + presence (brief
  36).
- **Seeded** behavior (named `Rng.fork` per bot) so a bot-filled match is reproducible —
  the bots' commands enter the deterministic log like any peer's.
- A bot is a thin AI driver over the existing Citadel personality/deliberation, submitting
  build/economy/attack commands; it is **not** privileged — same command surface as a human.

## Decisions (grilled 2026-06-19)

- **Flavor includes seeded NPC lobby bots** (alongside presence cursors + roster + emotes
  from [brief 36](2026-06-19-citadel-36-presence-roster-emotes.md)) — all three are in scope.
- Bots **join as peers** via the multi-writer server; their commands go through the
  authoritative log (so a bot match stays deterministic + replayable).
- **Seeded, not `Math.random`** — bot decisions flow through the seeded `Rng`.

## Acceptance

- Seeded NPC bots join a room as peers, appear in roster/presence, and submit commands
  through the authoritative log.
- A bot-filled match is reproducible from its seed + command-log.
- Bots use the same command surface as humans (no privileged path).
- **Determinism gate:** bot commands are in the log; replay equivalence holds. Proof —
  **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Dependencies / sequence

- **Depends on:** [35](2026-06-19-citadel-35-citadel-server-multiwriter.md) (H),
  [36](2026-06-19-citadel-36-presence-roster-emotes.md) (I).
- **Last item in the spine.**
