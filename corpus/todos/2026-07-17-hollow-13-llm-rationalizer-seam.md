# hollow-13 — LLM-rationalizer seam (bounded, anchored)

status: todo
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
