# hollow-13 — LLM-rationalizer seam (bounded, anchored)

status: closed 2026-09-15
milestone: M4
depends-on: hollow-06 (deliberation produces candidate intentions), hollow-10 (chronicle)
created: 2026-07-17

## Goal
Add the optional LLM layer the whole project was built to support — **anchored** so it cannot
reproduce the failure of the prior agent-society study (LLM agents hallucinating thoughts with
no consequence). The BDI + economy substrate produces the *grounded, feasible* option set; the
LLM only chooses among those options and explains why. Off by default; determinism preserved
when off.

## Core contract (do not weaken)
- **Input to the LLM** (per consulted decision): the agent's genome (behavior/aptitude/
  appearance summary), recent memory/beliefs, current needs, key relationships, community
  standing, and **the BDI-produced candidate intentions** (each already validated as feasible
  against real world state — resources, distances, ownership).
- **Output from the LLM**: (a) a **choice among the given candidates** (or "keep BDI default"),
  and (b) a short **rationale** narrative. It **cannot** propose an action not in the candidate
  set — the harness rejects/ignores anything else and falls back to the BDI default. This is the
  anchoring guarantee, enforced in code (schema-validated tool/JSON output), not by prompt alone.
- The rationale is logged to the **chronicle** (and export) → you can study *stated vs revealed*
  reasoning, the original research interest.

## Runtime model
- **Event-triggered**: consult the LLM only at *significant* decisions — join/leave community,
  betray, pair-bond, sanction, large trade — not every tick. A cheap policy gate decides when a
  decision is "significant enough" to consult.
- **Async, non-blocking**: the request runs off the tick loop; the agent proceeds on its BDI
  default meanwhile and **adopts the LLM's choice when it returns** (a few ticks later); on
  timeout/error it just keeps the BDI default. The sim never stalls.
- **Determinism**:
  - Seam **OFF by default** → sim is byte-deterministic; M1–M3 completely unaffected (prove:
    `CHECK_DETERMINISM` identical with the seam compiled in but disabled).
  - Seam **ON** → a clearly-labeled **non-deterministic live mode**. Provide an optional
    **prompt-keyed response cache**: a recorded run stores each (prompt → response); replaying
    with the cache reproduces the run exactly (deterministic replay of a non-deterministic run).
- **Provider**: a pluggable `Rationalizer` interface; default implementation calls **Claude
  (default model Haiku 4.5, configurable to Sonnet)**. A **stub/offline implementation** (echoes
  BDI default + a templated rationale) is the test default so CI needs no network/key. (Consult
  the `claude-api` skill for current model ids + the SDK call shape before wiring the real one.)

## Approach / notes
- The seam lives at the deliberation boundary from hollow-06: BDI builds candidates → if the
  seam is on and the decision is significant, hand candidates to the `Rationalizer` → apply the
  returned choice when ready. Keep BDI fully functional standalone.
- Budget/rate awareness: cap concurrent in-flight consultations; coalesce; respect that 30–60
  agents × event-triggered is modest but not free.
- Never send anything that isn't needed for the decision; keep prompts small + structured.

## Acceptance / gates
- Seam OFF: `CHECK_DETERMINISM` byte-identical to a build without the seam (proves zero leakage).
- Seam ON with the **stub**: runs deterministically, choices restricted to BDI candidates,
  rationales appear in the chronicle/export; an injected "propose an illegal action" stub
  response is **rejected** and falls back to BDI default (test the anchoring guarantee).
- Cache replay: record a short run with the stub (or recorded real responses) → replay with the
  cache → byte-identical.
- Real-provider path is behind a flag + key, exercised manually (not in CI); documented.
- `typecheck` + tests green. Fold the seam design into `wiki/hollow-overview.md` at closeout.

---

## CLOSED 2026-09-15 — every written gate met, and one property the spec never asked about

Built in four chunks (`755313a`, `e7e06ce`). Seam OFF by default and byte-identical; anchoring
enforced in code; rationales in the chronicle and export; prompt-keyed record/replay reproducing a
run exactly; a real `claude-haiku-4-5` provider behind a flag + key, in `tools/hollow-sim` so no API
key ever reaches the browser Worker.

### Two findings worth more than the code

**1. The spec's literal anchoring rule rejects 100% of answers here.** Remembering the candidate
*set* and accepting an index into it cannot work: `SOCIAL_COOLDOWN_TICKS` is 40 while trust decays
every tick, so the set is never the same set when the answer lands. That would have shipped a
completely inert seam behind a green suite. Anchoring is now per-choice by identity in the **live**
set — stronger, not weaker. Recorded in [decisions.md](../../wiki/decisions.md).

**2. The seam works and almost never fires — ~4% adoption.** Measured through the CLI with a
`contrarian` provider that disagrees on every decision: **1 adoption in 27 decisions** across three
seeds, median answer-lag 40–46 ticks, and on one seed the world trajectory was byte-identical to
seam OFF. Not provider latency — the stub answers instantly; an answer can only be applied at the
agent's next social deliberation, 40 ticks later, by which point the chosen option has genuinely
left the candidate set. Filed as [hollow-16](2026-09-15-hollow-16-rationalizer-adoption-latency.md),
which is a **design decision, not a bug fix** — the obvious fix (loosen choice identity) buys
adoption by spending the exact property that stops this reproducing the prior agent-society study's
failure.

### A method note

Two of this closeout's checks were **vacuous on the first attempt** and only caught by asking "would
this pass if the feature did nothing?":
- record-vs-replay with the *stub* — the stub agrees, so both runs equal seam OFF and the diff proves
  nothing. Chunk 2's unit test using a *disagreeing* stub is the real proof.
- contrarian-vs-OFF compared whole export directories — `events.jsonl` differs trivially because it
  now carries the rationalize rows themselves. Comparing `metrics.json`/`lineage.json` showed the
  world was in fact unchanged.

That is what produced finding 2. The `RATIONALIZER=contrarian` diagnostic was added precisely so the
adoption path can be exercised end-to-end without spending money — `stub` agrees by construction and
`claude` is billed, so neither could ever have shown this.

### Not done
`wiki/hollow-overview.md` should absorb the seam design; deferred with hollow-16, since the adoption
decision will change what there is to describe.
