---
title: "Citadel 34 — One-way gift/transfer command"
created: 2026-06-19
status: open
tags: [citadel, sim, diplomacy, multiplayer]
---

# Citadel 34 — Gift / transfer command

**Spine position: G (needs [28](2026-06-19-citadel-28-playerstate-refactor.md)).**
Small. Part of the [Citadel MP epic](closed/2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md).

**Lineage:** with per-player stockpiles (brief 28), co-op + soft diplomacy need a way to
move goods between players. Deliberately kept to a single explicit command — no formal
alliance machinery.

## Idea / Scope

A **one-way gift/transfer** command: send N of a good from your stockpile to player X.

- New command in the `CitadelCommand` union: `{ kind: "gift", to: PlayerId, good, amount }`.
- Handler validates the sender holds `amount` of `good`, deducts from sender's
  `PlayerState.stockpiles`, credits the recipient's.
- **NO formal alliance state** — trust is social, not modeled. A gift is just a transfer.

## Decisions (grilled 2026-06-19)

- **Diplomacy/sharing = explicit one-way gift/transfer command** (send N goods to player X).
- **NO formal alliance state** — trust is social.
- **Determinism stays load-bearing** — gift is a command in the authoritative log; pure
  stockpile arithmetic, no `Math.random`/`Date.now`.

## Acceptance

- A gift command moves N of a good from sender to recipient, validated against the sender's
  stockpile; rejected if unaffordable.
- No alliance/trust state is introduced.
- **Determinism gate:** sim-touching (stockpile arithmetic). Multi-seed `EXPORT=json`
  re-proof + targeted tests — **ask before running**.
- `npm run typecheck` + targeted vitest green.

## Dependencies / sequence

- **Depends on:** [28](2026-06-19-citadel-28-playerstate-refactor.md) (A — needs per-player
  stockpiles).
