# hollow-07 — headless research CLI, metrics & export

status: todo
milestone: M1
depends-on: hollow-03..06
created: 2026-07-17

## Goal
Make Hollow a real research instrument headless: run a seed over many generations with no
browser, capture the metrics and event stream, and export them for offline analysis. This is
the surface that lets you actually *study* emergence and is the M1 exit vehicle.

## Scope
- **`@tool/hollow-sim`** (mirrors `@tool/run-sim`): drives `bootstrapHollowSim` directly on the
  main thread, no Worker/DOM. Env knobs: `SEED`, `TICKS_PER_YEAR`, `MAX_GENERATIONS` (or
  `MAX_YEARS`; default open-ended-with-a-safety-cap for headless), `PERSONA_SEED` (path to a
  persona/genome seed file), `EXPORT=csv|json`, `EXPORT_FILE`, `CHECK_DETERMINISM=1`.
- **Metrics time-series** (sampled per sim-year): population; births; deaths by cause;
  community count + mean size; mean pairwise trust; wealth **Gini**; cooperation-vs-sabotage
  event rate; mean genome traits (drift). Written as tidy CSV (one row per sample) for easy
  plotting.
- **Event stream** (the chronicle): every significant structured event from hollow-04..06
  (births, deaths, pairings, community formed/joined/left/split/merged/dissolved, betrayals,
  famines) with tick + actors, as JSON lines — the input to M3's timeline and to offline study.
- **Lineage export:** dump the lineage record (ancestry, genomes, causes of death) as JSON.
- **`CHECK_DETERMINISM`:** run the same seed twice, assert byte-identical metrics + event
  streams (respect constrained-hardware rules: small `MAX_GENERATIONS`, and ASK before running
  a long determinism check).
- Root script `npm run sim:hollow` + `npm run check-determinism -w @tool/hollow-sim`.

## Approach
- Snapshot/metrics collection must be **off the deterministic sim path** (a read-only observer
  over world state each sampled tick), so sampling can't perturb the sim — mirror the Farm
  export design.
- Keep exports stable/sorted (deterministic key order) so diffs are meaningful.

## Acceptance / gates (this is the M1 EXIT BAR)
- A single command runs a seed over ≥5 generations and writes `metrics.csv` +
  `events.jsonl` + `lineage.json`.
- **Emergence is visible in the data:**
  - at least one community forms and at least one dissolves/splits,
  - cooperation-vs-sabotage rate differs meaningfully between at least two seeds,
  - ≥3-generation lineages with heritable trait drift,
  - population held in a stable band by scarcity (documented numbers).
- `CHECK_DETERMINISM` passes on a small run (byte-identical).
- Verified by actually reading an exported run and sanity-checking the story it tells — not by
  test green alone. Capture a short findings note; if it holds up, fold Hollow into a new
  `corpus/wiki/hollow-overview.md` + `log.md` and flip these briefs to `done/`.
