# hollow-16 — The rationalizer seam works, and almost never fires

status: todo — needs a DESIGN decision before any code
created: 2026-09-15
context: measured during [hollow-13](../closed/2026-07-17-hollow-13-llm-rationalizer-seam.md)'s closeout, through
the CLI rather than in unit tests. hollow-13 met every acceptance gate it was written with; this is a
property nobody had numbers for until the seam was actually run.

## The measurement

A `contrarian` diagnostic provider — one that **always** picks a candidate other than the BDI
default — was run through the headless CLI at 300 ticks across three seeds:

| seed | decisions | adopted | kept-default | rejected | median answer-lag |
|---|---|---|---|---|---|
| 7  | 18 | **0** | 2  | 16 (all `stale-candidates`) | 40 ticks |
| 11 | 7  | **1** | 1  | 5  | 40 ticks |
| 23 | 2  | **0** | 0  | 2  | 46 ticks |

**1 adoption in 27 decisions (~4%).** On seed 7 the world trajectory
(`metrics.json`, `lineage.json`, `summary.json`, and `events.jsonl` with the rationalize rows
filtered out) is **byte-identical to seam OFF** — a provider that disagreed with the substrate on
every single decision changed nothing at all.

## Why — and it is not provider latency

The stub answers **instantly**; the lag is structural. An answer can only be applied at the agent's
**next social deliberation**, and `SOCIAL_COOLDOWN_TICKS` is 40. Meanwhile trust decays every tick,
so the specific option the model chose has usually dropped out of the live candidate set by then —
correctly rejected as `stale-candidates`, because it genuinely is no longer on the table.

So the seam is: architecturally correct, unit-provably live (a contrarian stub with immediate
delivery *does* adopt — see `rationalize/seam.test.ts`), and **operationally ~4% effective at
default settings**. Both statements are true, which is exactly why this needed measuring rather
than reasoning about.

## The decision to make — do NOT just pick one

1. **Loosen choice identity to `kind` only** (drop the grounded payload). "Teach someone" survives a
   target change; "teach agent 7" does not. Raises adoption, **weakens the anchoring guarantee** —
   the adopted action is no longer provably the one reasoned about. Directly trades against
   [decisions.md](../../wiki/decisions.md) → *Hollow — the LLM-rationalizer seam*.
2. **Let an answer preempt, instead of waiting for the next deliberation.** Apply it when it arrives,
   re-validated against the live set at that moment. Much better adoption; needs care, because an
   agent mid-intention being redirected is a behavioural change well beyond this seam.
3. **Consult only where the answer stays relevant** — decisions that recur or persist, rather than
   one-shot social verbs on a 40-tick cooldown. Possibly the most honest fix: the seam may simply be
   attached at the wrong decision point.
4. **Accept ~4% and say so.** Defensible for "occasional significant decisions", but then
   `hollow-overview.md` must state the rate, because a reader will otherwise assume the LLM is
   steering the town when it is not.

Option 1 is the tempting one and the most dangerous — it buys adoption by spending the exact
property that makes this seam different from the prior agent-society study it was built to avoid
repeating.

## Files likely involved
- [`games/hollow/sim-core/src/rationalize/seam.ts`](../../../games/hollow/sim-core/src/rationalize/seam.ts) — when answers are adopted
- [`games/hollow/sim-core/src/rationalize/validate.ts`](../../../games/hollow/sim-core/src/rationalize/validate.ts) — `candidateOptionKey` identity
- [`games/hollow/sim-core/src/rationalize/policy.ts`](../../../games/hollow/sim-core/src/rationalize/policy.ts) — which decisions are consulted at all

## Acceptance
- A decision recorded in [decisions.md](../../wiki/decisions.md), with the adoption rate before and after.
- The contrarian diagnostic (`RATIONALIZER=contrarian`) shows a materially higher adoption rate, and
  the world trajectory **provably diverges** from seam OFF — compare `metrics.json`/`lineage.json`,
  **not** `events.jsonl`, which differs trivially because it carries the rationalize rows themselves.
  (That mistake was made once during hollow-13's closeout and briefly looked like success.)
- The anchoring guarantee still holds: every adopted action is one the substrate enumerated.
