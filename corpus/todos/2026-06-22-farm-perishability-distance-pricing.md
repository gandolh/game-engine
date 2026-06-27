---
title: "Farm Valley — perishability + distance pricing on sales (OpenTTD cargo decay), so layout & timing matter"
created: 2026-06-22
status: open
tags: [farm, sim, gameplay, economy, openttd-influence]
source: "OpenTTD research, 2026-06-22"
---

# Farm Valley — perishability + distance pricing

**OpenTTD-influence brief.** OpenTTD cargo pays on **type, amount, distance, and
days in transit**, with a decay curve: each cargo has early/late freshness
thresholds, perishables (passengers, food) start decaying immediately, durables
(coal, oil) tolerate long hauls, and value floors at ~12% if it sits too long
([Cargo income](https://wiki.openttd.org/en/Manual/Game%20Mechanics/Cargo%20income)).
This single mechanic is *why* OpenTTD players obsess over network layout and timing.

## Why

Farm Valley's economy is essentially AP-throughput: crops auto-bank, sales pay a
flat-ish price, and there is no *freshness* or *distance* dimension, so there's no
spatial/temporal optimisation to chew on. We already have the perfect hook —
**harbor contracts** pay a ×2.0–3.2 multiplier and the world is an archipelago of
21 farm islands with boat travel and WASM A* routing (see
[citadel-overview is Citadel; for Farm see] briefs 48 boats, 75 economy formula,
and the economy model in [wiki/economy.md](../wiki/economy.md)). Adding a
freshness/distance factor turns "what do I grow, when do I sell, where do I ship"
into a real decision instead of pure action-point grinding — and it makes the
existing harbor/boat infrastructure *mean* something.

## Scope

1. **Perishability per crop/product** — gold/silver quality tiers and produce decay
   in value if not sold within N days of harvest (fast-decay: fish, milk/eggs;
   slow-decay: grain, preserved goods). Quality tier and freshness multiply into the
   final sale price. Hooks into the existing quality system (Normal/Silver/Gold) and
   the g/AP formula in [wiki/economy.md](../wiki/economy.md).
2. **Distance bonus on harbor contracts** — a farther harbor pays more (it already
   has a multiplier band; make distance a factor), but the longer haul risks decay.
   Risk/reward on *where* you sell, mirroring OpenTTD's "long hauls pay more but
   delays destroy the value."
3. **(Optional) freshness readout** — a small "freshness" tell on stored produce so
   the player/AI can decide sell-now vs. ship-far. Keep it legible.

## Constraints

- **Determinism load-bearing** — any decay randomness through `Rng.fork`; never
  `Math.random`/`Date.now`. Decay is a deterministic function of (harvest tick,
  current tick). Prove with multi-seed `EXPORT=json` diffs, not just a determinism
  check.
- The BDI AI personalities (`conservative`/`aggressive`/`hoarder`/`opportunist`,
  [agents/registry.ts](../../games/farm/sim-core/src/agents/registry.ts)) must
  *react* to perishability in their `deliberate*` helpers, or the new dimension only
  affects Pip and the sim looks dumb. This is the main integration cost — budget for
  it.
- Keep the economy balanced: re-run the principled g/AP model
  ([wiki/economy.md](../wiki/economy.md)) so perishability doesn't silently break the
  crop spread. The baseline *will* move by design — note it in the economy page.

## Acceptance

- Identical produce sold fresh vs. stale, or near vs. far, pays measurably
  differently; the tradeoff is real and legible.
- AI personalities make sensible sell-now-vs-ship-far decisions (visible in a
  headless run).
- Economy stays balanced (no single crop dominates); determinism holds across seeds;
  [wiki/economy.md](../wiki/economy.md) updated with the new factor.

## Related

- Citadel's sibling decay/service idea:
  [2026-06-22-citadel-two-way-service-economy.md](2026-06-22-citadel-two-way-service-economy.md).
