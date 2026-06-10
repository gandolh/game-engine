# Brief 70 — Raise starting gold so early-game peer crop trades can close

**Status:** todo · **Area:** `packages/sim-core` (farmer specs, peer-trade interplay) · **Drafted:** 2026-06-10

Brief 59 fixed the peer-trade layer (price bug + `OFFER_CROP` path) and trades now close on most seeds — but on seed `0xc0ffee` early-game buyers are too cash-poor: every offer dies on the `would-breach-reserve` decline. Decision (open-questions round 2026-06-10): **raise the initial budget** so the early game has enough liquidity for the peer economy to function, rather than leaving it as an in-character constraint. ⚠️ This is a **sim balance change**: every seed's deterministic outcome shifts — the determinism *baseline* moves with it (reproducibility itself is untouched).

## Read first

- [corpus/briefs/game/done/59-*.md](../done/) — brief 59's instrumentation method (how peer-trade closes/declines were counted on a live run) — reuse it.
- [corpus/wiki/open-questions.md](../../../wiki/open-questions.md) — the residual-flatness entry this brief resolves.
- Memory/standing gotchas: instrument with the **WASM pathfinder** (JS one isn't route-equivalent) and **keep runs small** (low `MAX_DAYS`, `TICKS_PER_DAY=20`); **ask the user before any determinism check or sim run.**

## Current state (verified against code 2026-06-10)

- Starting gold lives in [sim-bootstrap.ts](../../../../packages/sim-core/src/sim-bootstrap.ts): personality template specs (~lines 78–118, `startGold` 50/80/120/70/60) and the 21-farmer roster (~lines 132+, per-farmer `startGold` + `minGoldReserve`, e.g. Cora 50/30, Atticus 80/10, Hannah 120/80). Grep `startGold` for the full set.
- The decline: [agents/peer-trade-policy.ts](../../../../packages/sim-core/src/agents/peer-trade-policy.ts) (~line 68) returns `{ decision: "decline", reason: "would-breach-reserve" }` when paying would push gold below the farmer's `minGoldReserve`.

## Tasks

- [ ] **1. Reproduce the baseline.** Instrument seed `0xc0ffee` (short run: ≤20 days, `TICKS_PER_DAY=20`, WASM pathfinder) counting peer crop offers, closes, and decline reasons per day-band. Confirm the early-game band closes ~0 trades, all `would-breach-reserve`.
- [ ] **2. Pick the smallest lever that works.** Preferred: a uniform `startGold` bump (try **+30** first, then +50) applied to the roster, preserving each personality's relative spread (Hannah stays richest, Atticus stays low-reserve gambler). Do **not** touch `minGoldReserve` values — the reserve personality stays meaningful; we're adding cash, not removing caution.
- [ ] **3. Re-instrument.** Same probe: early-game peer crop trades now close on `0xc0ffee` (target: ≥1 close in the first 15 days, and no regression on the 2 previously-working probe seeds from brief 59).
- [ ] **4. Sanity the arc, don't rebalance it.** On the probe seeds check the competitive shape still holds (lead crossings still occur post-day-20; no farmer trivially buys out the early shop slate). If +30 distorts the arc, prefer a smaller bump over compensating elsewhere — this brief adds liquidity, nothing else.
- [ ] **5. Update fixtures/tests** that assert specific startGold values or gold-dependent early outcomes; `npm run typecheck` + `npm run test`.
- [ ] **6. Corpus:** note the new baseline in [status.md](../../../wiki/status.md) + log entry; close the residual-flatness item in open-questions.md.

## Acceptance

- Early-game peer crop trades close on `0xc0ffee` (no longer 100% `would-breach-reserve`), with no regression on brief 59's working seeds.
- All tests green; deterministic reproducibility still holds at the new baseline (fast 3-seed/3-day diff of the *new* build against itself, run only with user sign-off).

## Risks / notes

- **Outcome shift is accepted and expected** — any recorded run-descriptor URLs replay differently after this lands. Say so in the log entry.
- Knock-ons to watch: shop-slate sellouts (richer day-1 buying), hire-help/upgrade affordability creep, hoarder reserve behavior. Observe in the step-3 probe; don't pre-tune.
