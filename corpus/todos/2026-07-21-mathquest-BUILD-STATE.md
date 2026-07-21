# MateQuest — BUILD STATE / RESUME (live tracker)

status: in-progress (M0 scaffold done, verified)
updated: 2026-07-21 (M0 scaffold complete on branch `mathquest`)

**Read this first to resume the MateQuest build.** Design-of-record is
[corpus/wiki/mathquest-overview.md](../wiki/mathquest-overview.md) — read it before any brief.
This file is the live progress tracker + the milestone plan.

MateQuest = the **fourth game** on the shared engine: a Romanian-curriculum (programa școlară,
grades I–VIII) math roguelike where **solving a problem IS the combat action**. Pokémon-style
Attack/Heal/Shield menu + Slay-the-Spire turn stakes; branching runs; two-layer progression
(in-run XP + persistent per-topic mastery); soft-roguelike death; loot grants math lifelines;
Romanian-folklore theme; Resurrect-64 palette; Web-Worker solo build like Citadel.

## How we'll build it (proposed — mirrors Hollow)
- Skill: **plan-split-dispatch**, backlog/wave mode. Controller (opus) plans/verifies/adjudicates;
  executor briefs dispatched to **Sonnet** subagents (per standing user directive). Never fable.
- **New branch off `main`** (e.g. `mathquest`). Per-milestone checkpoint commits. Commit only your
  own paths (concurrent sessions share the tree).
- **Verify gate after each milestone** (controller runs it, not the subagent):
  `npm run typecheck` (whole workspace) + `npm run test -w @mathquest/sim-core` (narrow) +
  git-tracked check (`git status --porcelain` shows new files). Commit only when green.

## Constraints (carry into every dispatch)
- **Constrained hardware**: small runs; **ALWAYS ask the user before any determinism/EXPORT check**;
  narrowest test scope (single workspace), never the full repo suite mid-wave.
- **Determinism load-bearing**: all randomness (problem generation, loot, map layout, enemy AI) via
  seeded `Rng.fork(label)`; no `Math.random`/`Date.now`. Problem generators MUST be deterministic so
  they're unit-testable and runs are reproducible.
- **Palette enforced**: every color via `MATE_PAL.*` (Resurrect 64), no raw hex; add a per-scope
  palette-guard test so `games/mathquest/` validates against Resurrect 64.
- **No `.js` import suffixes; pinned versions; TS strict** (repo-wide conventions).
- **Agent-prompt hygiene**: forbid `git reset`/`checkout`/`stash` in subagent prompts; subagents
  don't commit; controller integrates. Verify integration, not just green tests.
- Engine names no game; `@mathquest/*` imports `@engine/*` only.

## Milestone plan (B)

| Milestone | Goal | Key deliverables | Verify |
|---|---|---|---|
| **M0 — scaffold** | Game exists in the monorepo | `games/mathquest/{sim-core, client}` workspaces; deps wired (`@engine/core`, `@engine/ui`); `MATE_PAL` (Resurrect 64) + palette-guard test; empty Vite client boots; `npm run mathquest` script | typecheck + client boots |
| **M1 — turn-combat loop** | The pillar, end-to-end, with ONE hardcoded problem | Encounter → Attack/Heal/Shield menu → solve (typed) → action lands/fizzles → enemy telegraphs & hits → HP → win/lose one fight. In-canvas `@engine/ui`. Sim in Web Worker (Citadel pattern). | play one fight in browser; unit test the resolve logic |
| **M2 — problem-generator seam** | Deterministic curriculum content, grades **I–IV** | `ProblemGenerator` abstraction keyed by (grade, topic); deterministic via `Rng`; mixed input (typed vs MC + hand-crafted distractors); teach-card + re-queue; unit tests per generator | generator tests; solve real generated problems in a fight |
| **M3 — map & runs** | The roguelike frame | Branching node map with easy/hard bifurcations; a run = ~12 nodes + boss; soft-roguelike wipe → home | play a full run; map is deterministic per seed |
| **M4 — progression & loot** | Both progression layers + the lifeline economy | In-run XP/level-up-choice; persistent per-topic **mastery** (save/load); loot with combat bonuses **+ math lifelines** (hint/50-50/show-step/skip/+time); gear blueprints unlock | mastery persists across runs; lifelines work per input type |
| **M5 — theme, art, i18n** | Make it a game, not a prototype | Romanian-folklore skin (Zmeu/Balaur/Muma Pădurii bosses, hero trio); pixel art via atlas-recipe pipeline (placeholders until here); RO/EN i18n complete incl. word problems & teach cards | RO/EN toggle; art review; end-to-end playtest |

Sequencing note: M1 uses a hardcoded problem so the *loop* is proven before the *content* seam (M2).
Grades V–VIII generators come after M5 (or as an M2.5) once I–IV content is validated.

## Progress

| Milestone | State | Commit |
|---|---|---|
| Design (grill-me + research) | ✅ settled 2026-07-21 | `3fff5e0` |
| M0 scaffold | ✅ **done, controller-verified** (Sonnet executor) | (this session — see below) |
| M1 turn-combat loop | ⬜ not started | — |
| M2 problem-generator seam (I–IV) | ⬜ not started | — |
| M3 map & runs | ⬜ not started | — |
| M4 progression & loot | ⬜ not started | — |
| M5 theme, art, i18n | ⬜ not started | — |

## M0 — how it went (2026-07-21)
Dispatched fresh to a **Sonnet executor** (brief: `2026-07-21-mathquest-M0-scaffold.md`), templated on
`games/hollow/*`. Controller (opus) verified independently (not just trusting the report): re-ran the
gate green, confirmed `git status` touched only allowed paths, grepped clean of `Math.random`/`Date.now`
and stray hex, and read the bootstrap to confirm the determinism seam is **real** (uses `createRng`/
`World`/`Scheduler` from `@engine/core`, a real system mutating a real entity; the test asserts matching
RNG streams, not a weak stub).
- **Shape delivered:** `games/mathquest/{sim-core, client}`; `bootstrapMathquestSim({seed})` →
  `{world, scheduler, rng, step(), getSnapshot()}`; Web-Worker (20 Hz pacing) → `{tick}` snapshot →
  Canvas2D `@engine/ui` render of the title + live tick. `npm run mathquest` on **:5176**.
- **Palette:** `MATE_PAL` (32 EDG role names → hand-tuned Resurrect-64) + colocated integrity test;
  `engine/core/src/render/palette.test.ts` gained a `mathquest`→Resurrect-64 scope (the one engine edit).
- **Executor deviations (accepted):** forced `createRenderer(..., {backend:"canvas2d"})` (no WebGPU adapter
  in this sandbox — matches the known constraint); added `wgsl.d.ts` ambient decls (Hollow has the same —
  `@engine/core` barrel transitively imports `*.wgsl?raw`); bootstrap wrapper named `step()` per brief.
- **Not self-verifiable:** the browser visual (`npm run mathquest` on :5176) — **user eyeballs it**.
- Verify gate: `npm run typecheck` (19/19), `@mathquest/sim-core` (3), `@mathquest/client` (4),
  `@engine/core` palette test (10) — all green.

**Next: M1 — turn-combat loop** (one hardcoded problem, end-to-end). See milestone table above.

## Open decisions (resolved / carried)
- **Name / package / branch** — ✅ codename *MateQuest*, package `@mathquest/*`, branch `mathquest`
  (RO title *Cetatea Cifrelor*, provisional, in the boot title).
- **Grade order** — I–IV first (recommended), V–VIII after the loop is proven. (Confirm at M2.)
- **Art** — placeholder shapes through M4, real pixel art at M5 (recommended).
