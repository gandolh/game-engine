# Open Questions & Gaps

Live list of unresolved work and design questions. Items move out of here when a brief is written in [../briefs/](../briefs/) and back in (or get deleted) when answered.

## Code gaps (have a clear "next step")

- **Pathfinder loaded but unused.** [main.ts:77](../../packages/farm-valley/src/main.ts#L77) holds the `Pathfinder` instance behind `void pathfinder`. No system routes farmer movement through it. Next step: wire it into the travel/move intent path. See [pathfinder.md](pathfinder.md) (TODO if missing).
- **Aggressive end-of-sim liquidation.** Deferred in [01-personalities](../briefs/game/done/01-personalities.md) because there was no end-of-sim signal at the time. The game now ends at day 100 (leaderboard) — this is unblocked.
- **Trust score updates** between farmers were left as TODO in [01-personalities](../briefs/game/done/01-personalities.md). All farmers currently start at 0.5 and stay there.

## Design questions (no clear answer yet)

- **Tilemap layer on Canvas2D?** The original [01-tilemap](../briefs/engine/superseded/01-tilemap.md) brief was WebGPU. Background is currently drawn ad-hoc. Open question: do we need a real chunked tile layer? Only relevant if/when perf demands it.
- **Sim → Web Worker move.** [decisions.md](decisions.md) keeps the sim "pure so it can move to a Web Worker later." No trigger to do this yet.
