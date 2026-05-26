# Open Questions & Gaps

Live list of unresolved work and design questions. Items move out of here when a brief is written in [../briefs/](../briefs/) and back in (or get deleted) when answered.

## Code gaps (have a clear "next step")

- **Pathfinder integration** — now scoped in [05-village-and-farms](../briefs/game/todo/05-village-and-farms.md). Will close when that brief lands.
- **Aggressive end-of-sim liquidation.** Deferred in [01-personalities](../briefs/game/done/01-personalities.md) because there was no end-of-sim signal at the time. The game now ends at day 100 (leaderboard) — this is unblocked.
- **Trust score updates** between farmers were left as TODO in [01-personalities](../briefs/game/done/01-personalities.md). All farmers currently start at 0.5 and stay there. Brief 06's encounter system is a natural place to wire this in but it's explicitly out of scope there.

## Design questions (no clear answer yet)

- **Tilemap layer on Canvas2D?** The original [01-tilemap](../briefs/engine/superseded/01-tilemap.md) brief was WebGPU. Background is currently drawn ad-hoc. Open question: do we need a real chunked tile layer? Only relevant if/when perf demands it.
- **Sim → Web Worker move.** [decisions.md](decisions.md) keeps the sim "pure so it can move to a Web Worker later." No trigger to do this yet.
