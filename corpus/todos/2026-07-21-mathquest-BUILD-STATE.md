# MateQuest — BUILD STATE / RESUME (live tracker)

status: in-progress (M2 problem-generator seam done, verified)
updated: 2026-07-22 (M2 generators + mixed input + teach/re-queue complete on branch `mathquest`)

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
| M0 scaffold | ✅ **done, controller-verified** (Sonnet executor) | `db20d58` (+corpus `a93e96c`) |
| M1 turn-combat loop | ✅ **done, controller-verified** (Sonnet executor + opus finished `main.ts`) | `2101098` (+corpus `f67388c`) |
| M2 problem-generator seam (I–IV) | ✅ **done, controller-verified** (Sonnet executor) | (this session — see below) |
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

## M1 — how it went (2026-07-21)
Dispatched to a **Sonnet executor** (brief: `2026-07-21-mathquest-M1-combat-loop.md`). The user
**paused mid-run**; on resume the controller (opus) found the executor had been stopped right at
"write main.ts" — everything else was complete and typechecking, so the controller **salvaged** the
partial (≈730 lines, sim-core 14 tests green, `combat-screen.ts`/worker/theme/strings done) and
**finished the one missing file, `main.ts`, inline** (renderer + UISurface + single InputDispatcher +
focus-bridged a11y mirror + typed-answer buffer + physical-keyboard entry, mirroring Citadel's
`main/hud-panels.ts` + `main/input.ts` stripped to one UI root).
- **Combat model (sim-core):** deterministic, event-driven — state changes ONLY in
  `chooseAction`/`submitAnswer`, never in `step()`. `rng.fork("problem")` (a+b, operands 2..9) +
  `rng.fork("intent")` (5..8). Warrior 30 HP vs "Zmeu pui" 24 HP; attack 8 / heal 8 / shield 8 block.
  Killing blow skips the enemy turn; block absorbs-then-consumes; `Problem.answer` NEVER crosses the
  snapshot boundary (only `prompt`). Verified by reading the code, not just the green tests.
- **Client:** combat screen via `@engine/ui` (enemy/warrior HP bars painted in a `drawBars` pass,
  intent telegraph, Attack/Heal/Shield menu, math prompt + numeric keypad, result cue, win/lose banner
  + restart). Canvas2D backend (no WebGPU adapter here). Worker command channel:
  `init`/`choose-action`/`submit-answer` → `ready`/`snapshot`.
- **Known-minor (defer to M2 polish):** single `last` result field ⇒ on a non-killing action the
  enemy-hit cue overwrites the "Hit! −8"/"Fizzle!" cue (player's own action text only shows on a kill).
  HP-bar change still conveys success/whiff, so the loop reads fine. Fix later by splitting `last`
  into player-result + enemy-result.
- **Not self-verifiable:** the browser playtest (`npm run mathquest` :5176) — **user plays it**.
- Verify gate: `npm run typecheck` (19/19), `@mathquest/sim-core` (14), `@mathquest/client` (4),
  `@engine/core` palette (10) — all green; grep clean of `Math.random`/`Date.now` in code.

**Next: M2 — problem-generator seam (grades I–IV).** Replace the hardcoded `generateProblem` with a
`ProblemGenerator` keyed by (grade, topic); add mixed input (typed + MC w/ distractors), teach-card +
re-queue. Also fold in the M1 cue-sequencing polish.

## M2 — how it went (2026-07-22)
Dispatched to a **Sonnet executor** (brief: `2026-07-22-mathquest-M2-problem-generators.md`); ran to
completion in the background, all green. Controller (opus) verified independently: re-ran the gate,
**read `generators.ts` and recomputed the math** (subtraction draws `b∈[min,a]` ⇒ never negative;
multiplication grade-branched, grade 1 throws + is excluded by `TOPICS_FOR_GRADE`; comparison computes
the true relation and the shuffled `answerIndex` indexing is correct), and read the bootstrap to confirm
teach/re-queue/no-leak are real (`toProblemView` strips `answer`/`answerIndex`; `nextProblem` pops the
FIFO re-queue before generating; `acknowledgeTeach` runs the deferred enemy turn).
- **Seam:** `GENERATORS: Record<MathTopic, (rng,grade)=>Problem>` + `TOPICS_FOR_GRADE`. 4 topics —
  addition/subtraction/multiplication (typed) + comparison (choice `<`/`>`/`=`), difficulty-scaled per
  grade via `ADD_SUB_RANGE`/`MULT_G*` constants. **Deferred (not built):** word-problems, fractions,
  geometry, grades V–VIII.
- **Mixed input:** internal `Problem` (carries answer) → `ProblemView` (no answer) crosses the boundary;
  client submits `AnswerResponse = {kind:"typed",value} | {kind:"choice",index}`.
- **Teach-card + re-queue:** new `"teach"` phase; wrong ⇒ fizzle + push problem to FIFO `requeue` +
  show worked-step `teach`; `acknowledgeTeach()` then runs the enemy turn; `nextProblem` pops requeue.
- **Cue split (M1 nit fixed):** `lastPlayer` + `lastEnemy` both on the snapshot, rendered as 2 lines.
- **Grade selector** (I/II/III/IV) in the client posts `set-grade`; `MAX_ANSWER_DIGITS` bumped 3→5.
- **Contract:** worker inbound `init`/`choose-action`/`submit-answer{response}`/`acknowledge-teach`/
  `set-grade`; outbound `ready`/`snapshot`. `CombatSnapshot`: phase, warrior, enemy, `problem:
  ProblemView|null`, grade, `teach:string|null`, turn, lastPlayer, lastEnemy.
- **Accepted executor deviations:** comparison prompt is `"Compară: {a} și {b}"` (RO); grade-4 add/sub
  range `100–4999` (keeps `2·max ≤ 9999`, no clamp); `setGrade` has no phase restriction. All in spirit.
- **Not self-verifiable:** browser playtest (:5176) — **user plays it**.
- Verify gate: typecheck 19/19; `@mathquest/sim-core` **71**; `@mathquest/client` **17**; engine palette
  **10** — all green; determinism/hex sweep clean.

**Next: M3 — map & runs.** Branching node map (Slay-the-Spire / Mewgenics) with easy/hard bifurcations;
a run = ~12 nodes + boss; soft-roguelike wipe → home. Combat becomes one node type; hard branches raise
the grade/enemy. (Then M4 progression/loot, M5 folklore art + RO/EN.)

## Open decisions (resolved / carried)
- **Name / package / branch** — ✅ codename *MateQuest*, package `@mathquest/*`, branch `mathquest`
  (RO title *Cetatea Cifrelor*, provisional, in the boot title).
- **Grade order** — I–IV first (recommended), V–VIII after the loop is proven. (Confirm at M2.)
- **Art** — placeholder shapes through M4, real pixel art at M5 (recommended).
