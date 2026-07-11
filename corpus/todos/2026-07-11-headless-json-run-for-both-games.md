---
title: "Headless JSON run mode for Farm Valley + Citadel (LLM-readable game state, no browser)"
created: 2026-07-11
status: todo
tags: [tools, headless, citadel, farm, run-sim, citadel-sim, json, llm-context, playtest]
---

# Headless JSON run mode for both games

Run either game's **logic only** — no UI, no rendering, no virtual browser — and get back a
**structured JSON report** that a user or an LLM can read directly as context: what happened,
what the world looks like at the end, what went wrong. The goal is to make the cheap path
(headless) the default way to inspect game behavior, so **Playwright/`playtest-citadel` is
reserved for what genuinely needs a real browser** (rendering, input, UI) instead of being the
only way to see how a run went.

## Context — what already exists (verify before building)

Both headless runners exist; what's missing is the *output contract*.

- **Farm** — [tools/run-sim/](../../tools/run-sim/) drives `bootstrapSim()` on the main
  thread. It already has `EXPORT=csv|json` + `EXPORT_FILE`
  ([env.ts](../../tools/run-sim/src/env.ts), [format.ts](../../tools/run-sim/src/format.ts)),
  but the JSON is a **fixed per-day metric table** (`EXPORT_COLUMNS`) — a spreadsheet, not a
  world report. No final world state, no event log, no agent detail.
- **Citadel** — [tools/citadel-sim/](../../tools/citadel-sim/src/index.ts) (~1000 lines) has
  six scenarios (`grow`/`starve`/`siege`/`sack`/`fire`/`disease`) but emits **only
  `console.log` prose**. There is **no JSON export at all** — an LLM has to parse English
  summary lines to learn anything.
- Neither runner accepts **scripted player actions** (Farm's playable Pip; Citadel building
  placement / orders), so "play the game headlessly" is currently not expressible — the
  Citadel scenarios hardcode their layouts inside `index.ts`.

## What we want

1. **A shared report shape** (probably an engine-level or per-sim-core type, not duplicated in
   the two tools): run metadata (seed, ticks/day, days, scenario, git-ish version), a
   per-day/timeline series, an **event log** (raids, fires, disease, deaths, game-over,
   Farm market/encounter events), and an **end-state snapshot** (economy, population,
   buildings/plots, agents) — sized to be pasted into an LLM context, not a full ECS dump.
2. **One flag to get it**, symmetrically in both tools: e.g. `EXPORT=json` /
   `REPORT_FILE=...` on `npm run sim` **and** `npm run sim:citadel`.
3. **Optional: a scripted-action input** so a run can be *driven*, not just watched — a small
   JSON/TS script of actions (place building, plant/water, buy/sell) applied at given ticks.
   This is what would actually let an LLM "play" without a browser.
4. Keep it **off the deterministic sim path** — reporting is an observer over
   `getSnapshot()` / the message bus, never a new input to a tick. Multi-seed
   `EXPORT=json` diffs must stay a valid behavior-preservation proof.

## Acceptance

- `npm run sim:citadel` with the report flag writes a JSON file whose end-state + event log
  answer "how did this run go?" without reading any console prose.
- `npm run sim` (Farm) writes the same *shape* of report (not just the metric CSV columns).
- Determinism is untouched: same seed → byte-identical report (`CHECK_DETERMINISM=1` still
  passes; the report itself is reproducible).
- A follow-up agent can be handed the JSON alone and correctly describe what happened in the
  run.
- Typecheck + tests clean.

## Open questions (for the grill, when promoted)

- Report **size budget** — a 100-day Farm run with 21 agents could be huge. Cap it? Sample
  days? Summarize agents rather than dumping each?
- Does the shared shape live in `@engine/core/sim` (generic) or is each game's report its own
  type with only conventions shared? (Engine-never-imports-game rule applies.)
- Is the scripted-action layer in scope for the first brief, or a second one? (Read-only
  reporting is clearly separable and much cheaper.)
