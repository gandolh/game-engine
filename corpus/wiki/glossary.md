---
summary: The project's vocabulary — one canonical name per concept across the engine and the four games, each listing the synonyms it displaces (tick vs frame, spec vs brief, the two senses of "villager").
updated: 2026-08-23
---

# Glossary

One definition per term this project uses in a **specific** way, and the words that term
**displaces**. General programming vocabulary ("cache", "retry", "batch") does not belong here.

Rules: definitions, not mechanism — an entry that starts explaining *how* something works belongs
on a concept page and should link there instead. A term used against its definition is a **finding**,
not a typo: fix one side rather than quietly widening the definition. Two live meanings for one word
is two terms and needs two names (see **Villager** below for the one case this repo tolerates, and why).

## Corpus & process

**Spec**:
A work order in [todos/](../todos/) — the current scheme, one dated file per piece of work.
_Avoid_: brief (means the closed archive here), ticket, issue, story.

**Brief**:
A spec from the pre-2026-07 archive in [briefs/](../briefs/), closed to new files. Numbers are stable
for the life of the file. Historic prose (and `log.md`) uses "brief" for both schemes — new writing
should not.
_Avoid_: using "brief" for anything filed after 2026-07.

**Closeout**:
The recording step that ends a piece of work: move the spec to `closed/`, append a `log.md` entry,
fold the durable part into `wiki/`. Work is not done until it is closed out.
_Avoid_: wrap-up, sign-off.

**Gate**:
The objective check a chunk or wave must pass before it counts: `npm run typecheck` + the scoped
`npm run test`, plus a determinism check where sim code moved. Gates are pass/fail and run by the
controller, never self-reported by the agent that wrote the code.
_Avoid_: CI (there is none), acceptance (that is the spec's own section).

**Chunk**:
One dispatch unit under `plan-split-dispatch`: a single subagent, a curated context, and an exclusive
set of files. The only sense of "chunk" in this repo — the render layer has no chunked tile layer any
more (engine brief 07's scheme did not survive the WebGL2 migration).
_Avoid_: task, slice, subtask.

**Lane**:
The disjoint set of files a chunk owns for the duration of a wave. Lanes are what make parallel
subagents safe in one working tree, in place of a worktree.
_Avoid_: scope, ownership set.

**Wave**:
A group of chunks that can run in parallel because their lanes are disjoint. Waves are sequential;
gates run between them.
_Avoid_: phase (that means a milestone in a build program), round, batch.

**Baseline**:
The byte-exact output of a seeded headless run — what a determinism check compares against. Work that
changes sim results *by design* **moves the baseline**, and must say so; work that moves it by accident
is a bug.
_Avoid_: regression, drift, golden (unqualified).

**Verdict**:
A recorded PASS / CONDITIONAL / FAIL judgement on a visual or behavioural acceptance bar, with its
evidence filed under [verify/](../verify/).
_Avoid_: review, grade, score.

## Engine & sim (all four games)

**Tick**:
One fixed simulation step (20 Hz). The sim's only clock — a tick's output depends solely on the tick
count, never on wall time.
_Avoid_: frame, update, step, iteration.

**Frame**:
One render pass. A frame interpolates between the two latest snapshots by `alpha`; there is no
fixed frames-per-tick relationship.
_Avoid_: tick, draw call (that is one batch inside a frame).

**Day**:
`ticksPerDay` ticks. The value is supplied by the host, not fixed by the engine — Farm's client and
`run-sim` use 1200; tests routinely use 20. Any claim about "a day" is host-relative.
_Avoid_: cycle, round.

**Snapshot**:
The immutable, per-tick, render-facing view of the world (`RenderSnapshot`) — the **only** thing that
crosses the sim↔render boundary. Each game's `sim-core` defines its own.
_Avoid_: world state, game state, frame data, payload.

**Sim host**:
Whatever owns the scheduler and paces ticks: `@farm/server`'s `SimHost`, a game client's Web Worker,
or a headless tool driving the scheduler directly. "The sim runs somewhere off the render path" is a
statement about the host, not the transport.
_Avoid_: server (only Farm and Citadel MP have one), runner, engine.

**Sim-core**:
A game's deterministic, transport-agnostic sim package (`@farm/sim-core`, `@citadel/sim-core`, …).
Node-safe and browser-safe; never imports a renderer.
_Avoid_: core, backend, model.

**System**:
A unit of per-tick work registered on the scheduler. Registration **order is data dependency**, not
style — see [system-ordering.md](system-ordering.md).
_Avoid_: service, manager, processor.

**Palette role**:
A named color constant (`EDG.*`, `CITADEL_PAL.*`, `HOLLOW_PAL.*`, `MATE_PAL.*`) — the only sanctioned
way to name a color anywhere in the repo, enforced by a guard test.
_Avoid_: hex, swatch (that is the atlas's RGB tuple table), color constant.

**Tile feature**:
An interactive object occupying a tile (`TileFeature` — rock, tree, well) as opposed to the tile
itself. Features collide; tiles carry terrain.
_Avoid_: prop, object, entity (that is the ECS sense), decoration.

## Per-game vocabulary

The four games share the engine but not their nouns. Where a word means different things in two
games, **qualify it with the game** rather than widening the definition.

**Farmer** (Farm):
One of Farm Valley's 21 agents — 20 BDI AI archetype instances plus the playable **Pip**.
_Avoid_: villager, NPC, unit, character.

**Personality** (Farm):
A farmer's archetype (`conservative` / `aggressive` / `hoarder` / `opportunist`), dispatched on
`personality.kind` through the agent registry.
_Avoid_: AI type, behavior, strategy, class.

**Intention** (Farm, BDI):
An entry in a farmer's prioritized per-tick action queue — the *I* of Belief–Desire–Intention.
_Avoid_: goal (that is a desire), action (that is what ACT executes), plan.

**Pip** (Farm):
The single playable farmer. Everything else in Farm is watched, not driven.
_Avoid_: the player (ambiguous with the human), player character, hero.

**Plot** (Farm):
An owned, plantable tile group — the unit crops grow on.
_Avoid_: field, farm (that is the island), parcel.

**Villager** — **two senses, always qualified**:
- **Citadel villager**: a settlement inhabitant who can be assigned to a building as a worker.
- **Hollow villager**: an inhabitant of a Hollow settlement with needs, kin and a lifespan; work is
  one of many things it does.

  Both games' code says `villager`, and the word is not going to be renamed in either — so the
  discipline is to **never write bare "villager" in the corpus** when the page could be read as
  cross-game. In game-scoped pages the game is context and the bare word is fine.
  _Avoid_: unit, citizen, pop, agent (that is the engine-level sense).

**Run** (MateQuest):
One attempt through the branching map, from start to death or completion. Carries in-run XP; per-topic
mastery survives it.
_Avoid_: game, session, attempt, level.

**Problem** (MateQuest):
A generated, curriculum-graded math question. Solving one **is** the combat action — there is no
separate attack input.
_Avoid_: question, exercise, puzzle, challenge.

**Mastery** (MateQuest):
The persistent per-topic skill record that survives death, as opposed to in-run XP which does not.
_Avoid_: progress, level, XP.

## See also

- [decisions.md](decisions.md) — the locked calls this vocabulary encodes
- [CLAUDE.md](../CLAUDE.md) — when to add a term, and the decision-entry format
- [architecture.md](architecture.md) — where the engine-level nouns actually live
