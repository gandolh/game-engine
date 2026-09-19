---
summary: What MateQuest is (a Romanian-curriculum math roguelike — the FOURTH game on the shared engine) — design-of-record v0.1, BUILT (M0–M5 complete, playable). Turn-based Pokémon-style + Slay-the-Spire combat where solving a programa-școlară problem (**grades I–IV** — narrowed from the I–VIII intention on 2026-09-19, audit-54) IS the action; branching runs, two-layer progression (in-run XP + persistent per-topic mastery), soft-roguelike death, loot that grants math lifelines, Romanian-folklore theme, Resurrect-64 palette, Web-Worker solo build like Citadel; renders on the engine's WebGL2 backend (Canvas2D until 2026-08-18). Design settled 2026-07-21; the whole milestone plan shipped by 2026-07-23.
updated: 2026-08-18
---

# MateQuest — overview

> **Status: BUILT AND PLAYABLE (design-of-record v0.1 settled 2026-07-21; M0–M5 complete 2026-07-23).**
> The design tree below is settled *and shipped* — `games/mathquest/{sim-core,client}` exist on `main`,
> `npm run mathquest` runs it, and every milestone was controller-verified in-browser. What remains is
> an optional post-plan backlog (grades V–VIII generators), not the plan itself. Working name
> **MateQuest** (codename / package `@mathquest/*`); proposed Romanian title **_Cetatea Cifrelor_**
> ("The Citadel of Digits") — provisional. Per-milestone record + handoffs:
> [todos/2026-07-21-mathquest-BUILD-STATE.md](../todos/2026-07-21-mathquest-BUILD-STATE.md).

MateQuest is the **fourth game** on the shared TypeScript ECS engine (`@engine/*`), alongside Farm
Valley, Citadel, and Hollow. It is an **educational math roguelike**: a turn-based dungeon-crawl where
**solving a math problem _is_ the combat action**, aligned to the Romanian national curriculum
(*programa școlară*). **As built it covers grades I–IV** (ages ~6–10); the I–VIII ladder below is the curriculum the design was drawn from, and the gap is recorded in the scope decision under it. The design north star (from the research
that seeded it) is Raizada's principle — *solving the problem and the fun action must be the same
act* — so math is never a toll gate you clear to reach the game (the Prodigy failure mode); the
solve **is** the swing of the sword.

## The core design pillar (why it should work)

Most math games bolt a math widget next to a game and kids engage only the wrapper. MateQuest fuses
them: in a Pokémon-style battle you pick **Attack / Heal / Shield**, and a curriculum problem for
that action appears — **answering correctly is what makes the action land** (damage/heal/shield
scaled by difficulty & speed; a wrong answer *fizzles*). Combine that with **Slay-the-Spire** stakes
(enemies telegraph intent and hit on their turn; a real HP bar; enough wrong answers = death) and the
math carries genuine, low-anxiety tension.

## Locked design (v0.1)

| Axis | Decision |
|---|---|
| **Audience** | Romanian school, **grades I–IV as built** (the I–VIII ladder below is the curriculum's, not the game's — see the scope decision); difficulty = grade, **chosen by the player** via easy/hard map branches (incentive to climb, not forced) |
| **Language** | **Bilingual RO / EN** toggle from day one, centralized i18n |
| **Core loop** | Pokémon-style action menu (Attack / Heal / Shield) + Slay-the-Spire turn stakes; **solve math to land the chosen action**; enemies telegraph & strike on their turn; HP bar; wrong = fizzle |
| **Party** | You = **Warrior** (the **only solver in v1**) + auto-battling **Archer** & **Mage** companions; gear matters for all three |
| **Answer input** | **Mixed by question type** — typed keypad for computation, multiple-choice for concept/geometry/word problems; lifelines adapt per type |
| **Wrong answer** | Fizzle (+ possible retaliation) → **teach card with a worked step** → the problem (or a twin) **re-queues later** in the run (light spaced repetition) |
| **Map** | Branching node path (Mewgenics / Slay-the-Spire) with **easy/hard bifurcations** — hard branch = tougher math, better loot |
| **Progression (two layers)** | **In-run:** correct solves → XP → level up → pick an upgrade (resets per run). **Persistent:** per-topic **mastery meter** (honest learning signal) that survives death, gates hard branches, unlocks new problem types + gear blueprints |
| **Loot** | Equipment = combat bonuses **+ math lifelines** (hint, 50-50 on MC, show-a-step, skip, +time) — the *Who-Wants-to-Be-a-Millionaire* items |
| **Failure** | **Soft roguelike** — party wipe → back home; lose in-run gear/levels/gold, **keep mastery + blueprints**; retry freely (no permadeath dread for strugglers) |
| **Theme** | **Romanian folklore** — a Făt-Frumos-style hero trio vs **Zmeu / Balaur / Muma Pădurii**; legendary bosses |
| **Palette** | **Resurrect 64** (enforced per-game as `MATE_PAL.*`, per-scope palette-guard test like EDG32/Apollo) |
| **Tech** | New monorepo game `games/mathquest/{sim-core, client}`; sim in an **in-browser Web Worker** (Citadel-style), no server; **deterministic procedural problem generators** via the seeded `Rng`; reuses `@engine/core` + `@engine/ui`; ships as a static site a school can host |

## Curriculum ladder (programa școlară → difficulty)

"Choose your difficulty" ≈ "choose your grade" — the curriculum defines an 8-rung ladder, and the
design was drawn against all eight. **The game implements the first four**; the bands below are the
source material, and the scope decision after them says what is and is not built. Rough content bands (source: *programa școlară de matematică*, [ise.ro](https://www.ise.ro/wp-content/uploads/2017/01/Matematica.pdf)):

- **Cls. I–IV (primary):** number sense → +/−, ×/÷, naturals up to 1 000 000, intro fractions, units of measure, intuitive geometry.
- **Cls. V–VI (gimnaziu, lower):** ordinary + decimal fractions, divisibility, **negative/integer numbers**, ratios/proportions; geometry taught *intuitively, minimal notation*.
- **Cls. VII–VIII (gimnaziu, upper):** rational/real numbers, **equations & systems**, functions, Pythagoras, similar triangles — the curriculum explicitly shifts to *deductive reasoning* here.

Problem generators are the seam that turns each band into deterministic, testable content (see the
build plan). **V1 targeted grades I–IV first** (arithmetic is easiest to generate and verify),
intending to add V–VIII once the loop was proven.

### SCOPE DECISION 2026-09-19 — MateQuest is a grades I–IV game ([audit-54](../todos/closed/2026-09-18-audit-54-mathquest-grades-v-viii.md))

**The ladder above is the curriculum's, not the game's.** MateQuest implements the **primary band
only**, and every document that said "grades I–VIII" was describing an intention, not the build. The
claim is narrowed to match the code rather than the code stretched to match the claim.

**What ships, exactly** — `Grade = 1 | 2 | 3 | 4`
([`combat/types.ts:28`](../../games/mathquest/sim-core/src/combat/types.ts#L28)), four topics, with
`TOPICS_FOR_GRADE` as the per-rung table the acceptance asked for
([`generators.ts:209-214`](../../games/mathquest/sim-core/src/combat/generators.ts#L209-L214)):

| rung | topics | notes |
|---|---|---|
| **I** | addition, subtraction, comparison | multiplication excluded — the *programa* introduces it in clasa a II-a, and `generateMultiplication` throws if dispatched here |
| **II** | addition, subtraction, multiplication, comparison | ranges widen per rung via `ADD_SUB_RANGE[grade]`; multiplication branches on grade internally |
| **III** | addition, subtraction, multiplication, comparison | |
| **IV** | addition, subtraction, multiplication, comparison | `BOSS_NODE_GRADE` / `BOSS_GRADE` = 4 — the ladder's top rung |

**Be precise about what "I–IV" covers, because it is not the whole primary band either.** The four
topics are arithmetic and comparison. **Division, intro fractions, units of measure and intuitive
geometry are all in the I–IV curriculum row above and none of them is implemented.** Saying "grades
I–IV" is honest about the *rung*, not a claim of full coverage within it — do not read this table as
one.

**Why narrowed rather than built.** V–VIII is not "the same with bigger numbers". The curriculum
shifts to fractions, negatives, ratios, powers, equations and geometry, and the pillar — *solving a
problem IS the combat action* — constrains what is usable: an answer must be producible in a few
seconds, under turn pressure, on a canvas keypad. Today the input is typed naturals and
multiple-choice. **Fractions and negatives need answer-input affordances that do not exist, and that
is plausibly the larger half of the work** — larger than the generators. A multi-step equation may
not fit the loop at all, which would be a finding about the design, not a failure to execute. That is
a content-design project with open questions, and it was being carried as a backlog bullet in a plan
marked COMPLETE, where nobody routed to it.

**The bar that makes this non-negotiable:** in this game a wrong answer is a wrong thing taught to a
child. Grades V–VIII would need an *independent* answer check per new topic
([audit-55](../todos/closed/2026-09-18-audit-55-verify-problem-silent-pass.md), landed — the test
helper now fails if a topic has no independent check). Shipping a half-built gimnaziu tier under an
I–VIII banner is worse than shipping a complete primary one.

**If V–VIII is revived**, it is a new spec, and it starts at the design end: the topic table per rung
against the *programa*, which topics are viable as a combat action at all, what the input affordances
become, and how the run ladder stretches from 4 rungs to 8 (`BOSS_NODE_GRADE`/`BOSS_GRADE` and the
run pacing were tuned for four). Not "add four grades".

## Provenance & how the design was reached

Design settled 2026-07-21 in a single grill-me interview after a short web-research pass. Key research
inputs: the **DragonBox** model (math *is* the mechanic, but one narrow topic, no world) vs the
**Prodigy** model (rich endless world, but math is a shallow gate) — MateQuest deliberately targets the
gap between them; **Mewgenics** (turn tactics + branching adventure map) for the run structure (its
breeding/genetics layer was **considered and dropped** in favour of a fixed 3-class party + loot);
**Slay the Spire** for telegraphed turn stakes and branching nodes; Raizada, ["We need better math
games"](https://rajraizada.medium.com/we-need-better-math-games-or-this-music-has-a-great-beat-dfd651e7351e),
for the "solving IS the action" pillar.

## Not yet decided (small opens, provisional recommendations)

- **Name** — *MateQuest* codename; *Cetatea Cifrelor* proposed RO title. **Provisional.**
- ~~**Generator scope order** — build grades **I–IV first**, prove the loop, then V–VIII.~~ **SETTLED 2026-09-19:** I–IV is the game's scope, not a first phase of it. See the scope decision above.
- **Art** — start with **placeholder shapes/sprites** to prove the loop; commission pixel art via the
  atlas-recipe pipeline once the fun is confirmed. (Recommended.)

## Relationship to the rest of the repo

Obeys the monorepo layering rule: `@engine/core` → `@mathquest/sim-core` → `@mathquest/client`. The
engine names no game; MateQuest imports only `@engine/*`. It is the fourth palette scope — the
[palette guard test](../../engine/core/src/render/palette.test.ts) is per-scope, so
`games/mathquest/` will validate against **Resurrect 64**, everything else unchanged. See
[architecture.md](architecture.md) for the shared engine, [decisions.md](decisions.md) for locked
tech choices, and [citadel-overview.md](citadel-overview.md) for the Web-Worker solo-sim pattern this
game copies.
