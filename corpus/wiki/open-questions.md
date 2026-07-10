---
summary: Live list of what is genuinely unresolved, plus settled premises that must not be re-litigated. Resolved items are deleted, not archived.
updated: 2026-07-10
---

# Open Questions & Gaps

Live list of what's **genuinely unresolved**. Shipped/resolved items are deleted from here — their history lives in [status.md](status.md) + [log.md](../log.md). Verify any code ref before acting (paths drift).

## Open

### What does a *cozy* PvP army attack actually do? (blocks decision #12)
Decision **#12** (2026-07-10) says a sacked town-hall must **dent, not end** a player's run — the
cozy contract holds in MP. It does not say what an army attack *does instead*, and nothing in the
code answers it: today `ArmySystem` destroys the hall and sets `gameOver`
([army.ts](../../games/citadel/sim-core/src/systems/army.ts), asserted in `army.test.ts`).
The obvious candidates, none chosen: **pilfer goods and leave** (mirrors the cozy PvE raid, so the
two threat sources read consistently); **dent local happiness** around the hall (mirrors the cozy
fire/disease dent, feeding the ~60–70% productivity floor); or **capture territory** (takes the
influence radius, not the buildings — the only option that gives PvP a *lasting* stake without
breaking "nothing you built is taken from you"). Needs a design call before anyone touches
`ArmySystem`. Lethal elimination itself is not gone — it moves to Challenge mode (#13).

### Does Challenge mode also mean *competitive* Challenge? (scopes brief 103)
Decision **#13** makes Challenge mode the home of both `cozyThreats:false` **and** lethal PvP.
Unresolved: whether Challenge is a **solo** difficulty setting, an **MP** ruleset, or one flag that
means both. It matters because the two axes are independent in code today (`cozyThreats` and
`enableArmy` are separate bootstrap options), and collapsing them into one "Challenge" flag is a
design choice, not a refactor.

### Live-drama spare capacity (deliberately not pursued)
Harbor contracts (46) — mostly only the hoarder reaches the commit gate. Skills (43) — lopsided to farming. Festival (45) — physical podium gathering thin. Early-game peer trades — gated by **encounter cadence + seller stock, NOT gold**: brief [70](../briefs/game/done/70-raise-starting-gold-peer-trade-liquidity.md) lifted the cash constraint (zero `would-breach-reserve` declines) but the 15-day-close target stayed unmet because the binding constraint is `no-stock` + farmers barely meeting early. The lever (if it matters) is encounter frequency / early surplus, not liquidity.

## Settled premises — don't re-litigate

- **Leader-runaway / peer-interaction.** The old "one farmer runs away wire-to-wire, field stays flat, peer layer inert" story is **STALE**. The current 21-farmer radial field self-distributes (post-day-20 lead crossings on all 3 standard seeds); peer trades close over harvested-crop surplus after brief 59 fixed the price-reference bug (`CROP_SELL_PRICE` vs `SEED_COST`) + added the `OFFER_CROP` path. Re-probe before citing any old runaway numbers.
- **Pathfinder gotcha.** A headless `bootstrapSim` check **must** pass a `pathfinder`, or `TravelSystem` is omitted and every travel-gated action silently no-ops (false "dormant"). JS and WASM pathfinders are **not route-equivalent** — use WASM to match the determinism baseline. See [decisions.md](decisions.md).
- **Not worth it (researched).** WebTransport/WebRTC for a buffered spectator game; WebGL/WebGPU at ~300 sprites; archetype/SoA ECS at tens of entities; OffscreenCanvas-in-worker (the client/server split already freed the main thread); pinning farmer entity IDs (determinism risk is theoretical at 21 entities, `CHECK_DETERMINISM ×3` passes).
- **FPS regression was a SwiftShader artifact (brief 84, resolved 2026-06-12).** The "15–30 fps" came from headless Chromium on SwiftShader (CPU raster). A user real-GPU `?profile` export (`ANGLE / AMD Radeon`) shows the live game at **99 fps, `frame` JS 5 ms** — no GPU-overdraw problem on real hardware. `DEFAULT_ZOOM = 2` (kept) frames the opening shot in; its perf value is now insurance for weak/integrated GPUs + high-DPI, not a fix. Don't chase Tier-0 raster work without a *real-GPU* reading that actually shows a problem. See [performance.md](performance.md) Tier 0 + [briefs/game/done/84](../briefs/game/done/84-fps-regression-webgpu-reprofile.md).

## Resolved
History of resolved gaps (peer-interaction, leader-runaway, client/server split, auctions, day/night + long-days, atlas split, the travel-no-path diagnosis, …) lives in [log.md](../log.md) and [status.md](status.md). This page tracks only what's still open.
