# Open Questions & Gaps

Live list of unresolved work and design questions. Items move out of here when a brief is written in [../briefs/](../briefs/) and back in (or get deleted) when answered.

## Code gaps (have a clear "next step")

- **`act.ts` bypasses the slate-driven shop SELL.** Brief 08 wired ShopkeeperSystem.SELL to consume from the daily slate, but [act.ts](../../packages/farm-valley/src/systems/act.ts) still mutates farmer inventory directly for the `buy-seed` intent. Result: the slate's stock and price variance are invisible to running games today. Next step: route `buy-seed` through the bus (ONT_SHOP.SELL → ShopkeeperSystem → CONFIRM), or fold the slate lookup into act.ts itself.
- **CNP broken-commitment trust deltas are wired but inert.** Brief 10's TrustSystem accepts `cnpCoordinators: undefined` today because [hoarder.ts](../../packages/farm-valley/src/agents/hoarder.ts) keeps the coordinator registry as a private const. Next step: extract `coordinators` to a `cnp-registry.ts` module and pass the map into TrustSystem from `sim-bootstrap.ts`.
- **Responder-side OFFER_SEED ACCEPT trust delta** is documented in TrustSystem but not implemented (the initiator-side delta is). Wires up when a clear "I just accepted" signal exists — currently the receiver sends ACCEPT but doesn't record toward themselves. Low priority; the asymmetry is mild.

## Design questions (no clear answer yet)

- **Tilemap layer on Canvas2D?** The original [01-tilemap](../briefs/engine/superseded/01-tilemap.md) brief was WebGPU. Background is currently drawn ad-hoc. Open question: do we need a real chunked tile layer? Only relevant if/when perf demands it.
- **Sim → Web Worker move.** [decisions.md](decisions.md) keeps the sim "pure so it can move to a Web Worker later." No trigger to do this yet.
