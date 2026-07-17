# hollow-11 — persona authoring + live perturbation

status: todo
milestone: M3
depends-on: hollow-10 (app shell), hollow-05 (genome/persona-seed format)
created: 2026-07-17

## Goal
Make the director role real in-app: author the personas that seed a run, and perturb a running
town with time controls + environmental shocks — while keeping runs reproducible via a logged
intervention stream.

## Scope
### Guided persona authoring (pre-run setup)
- A setup screen that produces the **same `persona-seed` file the headless CLI consumes**
  (one format, GUI ⇄ CLI). It lets the director:
  - pick **named archetype presets** (e.g. cooperator, opportunist, hoarder, loner, nurturer)
    that seed starting genomes,
  - set **how many** starting agents of each archetype,
  - **fine-tune genes** with sliders (behavior weights, aptitude affinities, appearance ranges),
  - **randomize-with-lock** (lock the genes you care about, roll the rest),
  - set the run seed + world resource density.
- Presets are data (a preset = a genome template + variance), editable and extensible.

### Live perturbation (locked set: time + shocks only)
- **Time controls**: pause/resume, speed 1×–8×, single-step. (Pure pacing — no determinism
  impact.)
- **Environmental shocks**: famine (cut node yields for a window), boom (raise them), disaster
  (destroy a node / damage a territory), plague (a bounded need-drain). Each is a coarse,
  world-level lever — no per-agent editing (deferred).
- Every shock is recorded to an **intervention log** (tick + type + params) so a run is
  reproducible from **seed + persona-seed + intervention-log**. Applying a shock draws its
  randomized specifics from a named `Rng` fork so replay is exact.

### Save / share a run
- Serialize seed + persona-seed + intervention-log into a run descriptor (mirror Farm's
  URL-hash descriptor). Loading it re-runs the town identically.

## Approach / notes
- Authoring writes the persona-seed via the shared serializer from hollow-05/07 — do not invent
  a second schema.
- Shocks enter the sim as world-level messages/commands on the existing bus at a tick boundary
  (never mid-tick), so they're ordered deterministically with the intervention log.
- Explicitly OUT of scope (deferred past M3): spawn/kill/edit individual agents, live rule/
  threshold tuning. Leave clean extension points but don't build them.

## Acceptance / gates
- Author a persona-seed in-app → run it → the starting population matches the authored
  archetypes/counts/genes; the same file drives an identical headless CLI run.
- Fire a famine mid-run → yields drop, need pressure rises, and (per M1 dynamics) cooperation/
  defection/community churn responds — visible in chronicle + dashboard.
- Reproducibility: seed + persona-seed + intervention-log replays **byte-identically** (add a
  determinism test that records a short interactive-style run's interventions and replays them).
- `typecheck` + tests green.
