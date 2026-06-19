---
title: "Citadel 36 — Presence cursors + player roster + emotes (off the log)"
created: 2026-06-19
status: open
tags: [citadel, server, multiplayer, presence, flavor]
---

# Citadel 36 — Presence, roster, emotes

**Spine position: I (needs [35](2026-06-19-citadel-35-citadel-server-multiwriter.md)).**
The ephemeral-flavor layer of the
[Citadel MP epic](closed/2026-06-19-citadel-26-multiplayer-presence-bots-emotes.md). Absorbs the
presence/emotes scope from the superseded brief 26.

**Lineage:** tiny-world-builder sends **presence** (cursor / active-tool) on a channel
**separate from durable edits**, and relays **emotes** (`/wave /jump /dance`) to all peers.

## Idea / Scope

Add the ephemeral social layer, kept **off the authoritative command-log** so saves/replay
stay deterministic.

- **Presence cursors:** each peer's cursor position / active tool, relayed live.
- **Player roster:** who's in the room (id, display, alive/eliminated).
- **Emotes / reactions:** relayed to all peers, mapped to feedback.
- **CRITICAL — all ephemeral, OFF the command-log.** Presence/roster/emotes flow on a
  separate relay channel, **never** stamped into the authoritative log. This keeps the log
  pure (sync + save substrate) and deterministic; replaying a saved game never replays a
  cursor wiggle or an emote.

## Decisions (grilled 2026-06-19)

- **Flavor includes presence cursors + player roster (ephemeral, OFF the command-log)** and
  **emotes/reactions.** (Seeded NPC lobby bots are the separate
  [brief 37](2026-06-19-citadel-37-npc-lobby-bots.md).)
- **Ephemeral channel, not the command-log** — so saves stay deterministic.
- Mirrors tiny-world-builder's separation of presence from durable edits.

## Acceptance

- Each peer's cursor + active tool is visible to others, live.
- A player roster shows who's present and alive/eliminated.
- Emotes/reactions relay to all peers.
- **None** of presence/roster/emotes appears in the authoritative command-log; a save/replay
  is byte-identical with or without any presence/emote traffic.
- `npm run typecheck` + targeted vitest green.

## Dependencies / sequence

- **Depends on:** [35](2026-06-19-citadel-35-citadel-server-multiwriter.md) (H — needs the
  server transport + relay channel).
- **Unblocks:** [37 npc-lobby-bots](2026-06-19-citadel-37-npc-lobby-bots.md) (J).
