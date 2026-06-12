# Brief 86 — juice beats + floating number popups

Promoted from [wiki/performance.md](../../../wiki/performance.md) Tier 3, where these were explicitly "deferred until pixel-snap (67), camera smoothing (67) and ambient life (68) land" — all three landed 2026-06-11. This is the remaining Tier-3 backlog.

## Why

For a spectator economy game, the economic events ARE the action — and today they only surface as text in the event feed. Render-side juice makes them legible at a glance without touching the sim.

## Tasks (all render-only, wall-clock, off already-snapshotted events)

1. **Floating number popups.** "+12g" on sells/harvests/contract payouts, easeOutCubic rise + fade, anchored to the farmer/structure sprite. The sim already emits these events to the feed — this is a pure render consumer. EDG colors only.
2. **Trauma-based screen shake.** `shake = trauma²`, decaying, **tiny** (2–4 px), positive beats only — lead crossing, festival win, lobster catch. Must compose with brief-67 camera smoothing, not fight it (apply as a post-smoothing offset).
3. **Hitstop.** 2–4 *render* frames frozen on a major event (rank flip, auction win). Render-side pause of interpolation only — the sim ticks on; never delay snapshot consumption enough to underrun the 2-tick buffer.
4. **Score-bump.** Leaderboard number scales 1.0→1.3→1.0 (easeOutBack) when a value rises. DOM/CSS transform, cheap.
5. **Drama-weighted intensity:** events already carry a `drama` score (brief 38) — use it to scale popup size / shake trauma so big beats feel bigger.

## Acceptance

- Zero sim/snapshot changes — no determinism impact, no baseline move; verify nothing imports sim-core sim systems.
- All colors via `EDG.*`; palette guard green.
- Per-event-type cap + pool for popups (the brief-68 ambient pattern) so a busy market day can't spawn unbounded DOM/sprites.
- Manual feel-check in browser; effects should read as *cozy*, not arcade — when in doubt, halve the magnitude.
- `H` skip-to-highlight (brief 40) + tab-resync (brief 66) still behave: fast-forward and resume must not replay a burst of stale popups.
