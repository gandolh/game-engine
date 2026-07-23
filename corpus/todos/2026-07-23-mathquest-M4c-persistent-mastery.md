# MateQuest M4c — persistent per-topic mastery (save/load, hard-branch gate, blueprints)

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-07-23
design-of-record: [../wiki/mathquest-overview.md](../wiki/mathquest-overview.md) · tracker: [2026-07-21-mathquest-BUILD-STATE.md](2026-07-21-mathquest-BUILD-STATE.md) · builds on M4a/M4b: [2026-07-23-mathquest-M4a-progression-loot.md](2026-07-23-mathquest-M4a-progression-loot.md) · [2026-07-23-mathquest-M4b-lifelines.md](2026-07-23-mathquest-M4b-lifelines.md)

## Scope (M4c — the LAST M4 slice; read this boundary carefully)

M4a (XP/level-up + loot stat bonuses, `8c9f722`) and M4b (lifelines, `f1a435a`) are done. **This brief
is M4c:** the game's FIRST cross-run persistence — a **per-topic mastery meter** that SURVIVES death,
**gates hard branches**, and **unlocks gear blueprints**. Per the design-of-record's two-layer
progression ("Persistent: per-topic mastery meter … survives death, gates hard branches, unlocks new
problem types + gear blueprints") and soft-roguelike failure ("keep mastery + blueprints").

**In scope:** the persistent `MasteryStore` (localStorage), per-topic tiers, hard-branch (elite) gate,
blueprint unlocks that feed the loot pool. **Deferred (call out, don't build):** "unlock new problem
types" (there are only the 4 M2 topics + grades I–IV today; V–VIII generators are post-M5, so there is
nothing new to unlock yet — leave a note); a fancy dedicated mastery/progress SCREEN (a readout on the
run-over screen + a compact map-HUD line is enough); any migration beyond version-check-then-reset.

## THE load-bearing architecture constraint (read first)

**The sim runs in a Web Worker. Web Workers CANNOT access `localStorage`.** So persistence MUST be
owned by the **main thread** (`client/src/main.ts`), exactly like Citadel/Farm do
(`games/citadel/client/src/main/panel-prefs.ts`, `games/farm/client/src/ui/canvas/panel-prefs.ts` —
read one for the try/catch idiom). The seam:

1. **Boot (main thread):** read `localStorage["mathquest.mastery.v1"]` → `parseMasteryStore(raw)` (a
   pure sim-core fn — returns `EMPTY_MASTERY_STORE` on null/invalid/version-mismatch) → post
   `init { seed, mastery }` to the worker.
2. **Sim (worker):** `bootstrapMathquestSim({ seed, mastery? })` seeds its closed-over persistent
   store from `mastery` (default `EMPTY_MASTERY_STORE`). The sim UPDATES the store on every fight end
   and includes the full store in every snapshot's `RunView.mastery`.
3. **Persist-back (main thread):** on each snapshot, if `JSON.stringify(run.mastery)` differs from the
   last-written value, `localStorage.setItem(...)` it. (Cheap; the store is tiny.)
4. `newRun()` does **NOT** reset mastery — it persists across runs and death. Only the in-run state
   (xp/level/stats/inventory/lifelines/map) resets.

The sim never touches `localStorage`/DOM; the main thread never computes mastery — it only ferries the
store in on init and out on change. Keep it that way.

## Constraints (carry into the work — identical to M4a/M4b)
- **Determinism load-bearing.** All randomness via `rng.fork(label)` — never `Math.random`/`Date.now`.
  With M4c, a run's map + loot now depend on persistent mastery, so the determinism contract becomes
  **(seed, mastery, command script) → identical**. Do NOT reorder existing forks (`map`/`run:${n}`/
  `node:${id}`/`levelup`/`loot`/combat's `intent`/`topic`/`problem`/`fifty`). No NEW fork is needed
  (mastery changes the fork INPUTS — `generateMap`'s elite decision, `rollLoot`'s pool — not the fork
  sequence).
- **Answer non-leak invariant stays.** `answer`/`answerIndex` never cross the snapshot boundary.
- **Palette:** every colour via `MATE_PAL.*` (no raw hex). **RO by default** — all new UI strings in
  `client/src/strings.ts`. Blueprint/item names may live in `run/*.ts` (sim-side content). **Also fix
  the pre-existing EN literal** in `ui/run-over-screen.ts` (`"${n} nodes visited — Warrior HP: …"`) —
  move it to a RO `STRINGS.*` helper as part of this work.
- **No `.js` suffixes; TS strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — omit
  optional keys, never assign `undefined`); pinned versions. Don't commit (controller integrates). No
  `git reset`/`checkout`/`stash`.
- Narrowest test scope while working (`-w @mathquest/sim-core`, `-w @mathquest/client`); **do NOT run
  determinism/EXPORT checks** (the controller asks the user) or the full repo suite.

## Current seams (already built — integrate with these, don't reshape)
- `sim-core/src/combat/types.ts` — `MathTopic = "addition"|"subtraction"|"multiplication"|"comparison"`,
  `Grade`, `Problem` (carries `.topic`).
- `sim-core/src/combat/combat.ts` — `createCombat`; `submitAnswer` is where a solve's correctness is
  known and `state.pendingProblem.topic` is available; `CombatResult` (currently `{outcome, warriorHp,
  xpEarned}`) is the fight-end report the driver reads.
- `sim-core/src/run/map.ts` — `generateMap(rng): RunMap`; the `"elite"` node is the hard fork (one
  column of the single `branchRow`, grade bumped +1). This is what the mastery gate controls.
- `sim-core/src/run/loot.ts` — `rollLoot(rng, tier): Item[]`, `COMMON_POOL`/`BETTER_POOL`, `Item`.
- `sim-core/src/run/progression.ts` / `run/lifelines.ts` — the pattern to mirror for a new `run/*.ts`
  data module (pure types + constants + pure fold fns; `sim-bootstrap.ts` owns the mutable state).
- `sim-core/src/sim-bootstrap.ts` — the run driver: `bootstrapMathquestSim({seed})`, closed-over run
  state, `generateMap`/`rollLoot` call sites, `resolveCombatIfOver` (fight-end hook — win AND loss),
  `newRun` (resets in-run state), `getSnapshot`/`RunView`, the `export type {…}` re-export block.
- `client/src/worker/sim-worker.ts` — `init { seed }` handler; command channel.
- `client/src/main.ts` — boots the worker, posts `init`, reads snapshots. Owns the render loop.
- `client/src/ui/run-over-screen.ts` — `refresh(mode, run)`; the natural place for a mastery readout.
- `client/src/ui/map-screen.ts` — the fixed top HUD (Nivel/XP/stats) `drawChrome`; add a compact
  overall-mastery line there.

## LOCKED mechanics (implement exactly — controller-decided so it's deterministic + testable)

### The persistent store (`sim-core/src/run/mastery.ts`, new)
```ts
export interface TopicMastery { readonly correct: number; readonly attempts: number }
export interface MasteryStore {
  readonly version: number;
  readonly topics: Record<MathTopic, TopicMastery>;   // ALL 4 topics always present
  readonly blueprints: readonly string[];             // unlocked blueprint ids, sorted, deduped
}
export const MASTERY_STORE_VERSION = 1;
export const MASTERY_STORAGE_KEY = "mathquest.mastery.v1";
export const EMPTY_MASTERY_STORE: MasteryStore = { version: 1, topics: {addition:{correct:0,attempts:0}, …all 4…}, blueprints: [] };
```
- **Tiers (per topic, by lifetime correct-solve count):** `MASTERY_TIER_THRESHOLDS = [5, 15, 30]` →
  `masteryTier(correct): 0|1|2|3` (0 below 5, 1 at ≥5, 2 at ≥15, 3 at ≥30). `masteryPct(m) =
  attempts>0 ? correct/attempts : 0` (for display only).
- **Overall:** `overallMasteryTier(store) = sum of masteryTier over the 4 topics` (0..12).

### Per-fight outcome reporting (combat → driver)
- `CombatResult` gains `topicOutcomes: Record<MathTopic, TopicMastery>` — accumulated over the WHOLE
  fight: on each `submitAnswer`, `topicOutcomes[problem.topic].attempts += 1`, and `.correct += 1` iff
  correct. A **skip** (M4b) is NOT a solve → does not touch outcomes; **hint/fifty** don't change
  recording (the eventual `submitAnswer` records it). Initialize the accumulator to all-zero for the 4
  topics in `createCombat`. (This is the ONLY combat change — no new snapshot field, no fork.)

### Folding + blueprints (pure, in `mastery.ts`)
- `foldTopicOutcomes(store, outcomes): MasteryStore` — returns a NEW store: per topic add
  `correct`/`attempts`; then recompute unlocked blueprints (see below) and merge into `blueprints`
  (deduped + sorted for a stable, comparable serialization). Pure; never mutates its args.
- **Blueprints:** ONE per topic, unlocked when that topic reaches **tier 2 (≥15 correct)**:
  `BLUEPRINTS: Record<MathTopic, { id: string; item: Item }>` — e.g. addition → `{id:"bp-adunare",
  item:{id:"sabie-de-maestru", name:"Sabie de maestru", bonus:{atk:4}}}`, subtraction →
  `{id:"bp-scadere", item:{ ...+3 block ...}}`, multiplication → strong two-stat, comparison →
  a lifeline-granting item (`bonus:{}, lifeline:{kind:"hint", charges:3}`) — 4 distinct, all
  meaningfully better than the base pools. `blueprintItemsFor(blueprints): Item[]` maps unlocked ids →
  their items (ignore unknown ids defensively).
- `parseMasteryStore(raw: string | null): MasteryStore` — JSON.parse in try/catch; return
  `EMPTY_MASTERY_STORE` on null, parse error, `version !== MASTERY_STORE_VERSION`, or any shape
  violation (missing/NaN topic fields, non-array blueprints). On success, normalize: ensure all 4
  topics present (fill missing with `{0,0}`), coerce blueprints to a deduped sorted string[]. This is
  the migration story for v1 (validate-or-reset) and is unit-tested as the persistence round-trip.

### Hard-branch (elite) gate — `run/map.ts`
- `generateMap(rng, opts?: { eliteUnlocked?: boolean }): RunMap`. `eliteUnlocked` **defaults to `true`**
  (so `map.test.ts`'s existing direct `generateMap(rng)` calls stay byte-identical). When `false`, the
  branch row's would-be `"elite"` node is emitted as a normal `"combat"` node at the row's BASE grade
  (no `+1` bump) — i.e. no hard fork at all. The map stays a fully-connected valid DAG either way
  (this NEVER soft-locks a run — the gate is at GENERATION, not at `chooseNode`, so the player can
  always traverse whatever map exists).
- The driver computes `eliteUnlocked = overallMasteryTier(store) >= ELITE_UNLOCK_TIER` with
  `ELITE_UNLOCK_TIER = 2` and passes it into BOTH `generateMap` call sites (first run + `newRun`). A
  fresh player (empty store, overall 0) therefore gets NO elite until they've earned ~2 tiers total —
  the meter's teeth. Deterministic: same (seed, mastery) → same map.

### Loot from blueprints — `run/loot.ts`
- `rollLoot(rng, tier, extraPool?: readonly Item[]): Item[]` — `extraPool` **defaults to `[]`** (so
  existing `rollLoot(rng, tier)` calls/tests stay byte-identical). When non-empty, the blueprint items
  join the BETTER pool for the draw (so mastery → better future loot). Keep the "3 distinct by id"
  logic; the enlarged pool must still yield 3 distinct (it always can). The driver passes
  `blueprintItemsFor(store.blueprints)` as `extraPool`.

### Driver wiring — `sim-bootstrap.ts`
- `MathquestSimOptions` gains `mastery?: MasteryStore` (default `EMPTY_MASTERY_STORE`). Store it in a
  closed-over `let masteryStore = opts.mastery ?? EMPTY_MASTERY_STORE`.
- First-run + `newRun` `generateMap` calls pass `{ eliteUnlocked: overallMasteryTier(masteryStore) >= ELITE_UNLOCK_TIER }`.
- `rollLoot` call passes `blueprintItemsFor(masteryStore.blueprints)` as `extraPool`.
- `resolveCombatIfOver`: on fight end (win OR loss — mastery is honest and survives death), before the
  win/loss branching, `masteryStore = foldTopicOutcomes(masteryStore, result.topicOutcomes)`. (Fold
  once per fight; the store then rides out in the next snapshot for the main thread to persist.)
- `newRun()`: do NOT reset `masteryStore`. Recompute `eliteUnlocked` for the new map from the CURRENT
  (persisted) store. Everything else resets as before.
- `RunView` gains `readonly mastery: MasteryStore`; `getSnapshot` sends it on every variant (send the
  object as-is — it's already immutable/rebuilt-on-change by `foldTopicOutcomes`).
- Re-export `MasteryStore`/`TopicMastery` + `MASTERY_STORAGE_KEY`/`parseMasteryStore`/
  `EMPTY_MASTERY_STORE` from `sim-bootstrap.ts` (and `index.ts`) like the other run modules, so the
  client imports them from `@mathquest/sim-core`.

### Worker — `worker/sim-worker.ts`
- `init` message gains `mastery: MasteryStore`; forward to `bootstrapMathquestSim({ seed: msg.seed,
  mastery: msg.mastery })`. Update the `WorkerInitMessage` interface.

### Client — `main.ts` + `strings.ts` + `ui/run-over-screen.ts` + `ui/map-screen.ts`
- `main.ts`: on boot, `const mastery = parseMasteryStore(localStorage.getItem(MASTERY_STORAGE_KEY))`
  (wrap the `localStorage` access itself in try/catch — private-mode/blocked storage must degrade to
  `EMPTY_MASTERY_STORE`, never throw), then `post({ type:"init", seed: SEED, mastery })`. In the
  snapshot handler, keep a `lastPersisted: string` and when `JSON.stringify(snapshot.run.mastery)`
  changes, `try { localStorage.setItem(MASTERY_STORAGE_KEY, that) } catch {}`.
- `ui/run-over-screen.ts`: add a **mastery readout** — one line per topic: RO topic name + `correct/attempts`
  + tier (e.g. "Adunare: 12/15 · Nivel 2"), from `run.mastery`. Also RO-ify the existing summary line
  via a new `STRINGS.runSummary(nodes, hp, maxHp)` helper (kill the EN literal). Build-once tree +
  per-frame rebind, same shape as the current screen.
- `ui/map-screen.ts`: add a compact overall-mastery line to the fixed top HUD (e.g. "Măiestrie: 5/12"
  from `overallMasteryTier`), palette-pure, RO label from `STRINGS`. Small; don't disturb the
  terrain/camera code.
- `strings.ts`: `topicName: Record<MathTopic,string>` (Adunare/Scădere/Înmulțire/Comparare), a
  mastery-line formatter, `masteryHudLabel(sum)`, `runSummary(...)`, and a "ramuri grele deblocate"-style
  note is OPTIONAL (nice-to-have; skip if it crowds the HUD).

## Tests (sim-core; new `run/mastery.test.ts` + extend `combat`/`map`/`loot`/`sim-bootstrap` tests)
- **tiers:** `masteryTier` at the 0/5/15/30 boundaries; `overallMasteryTier` sums the 4.
- **fold:** `foldTopicOutcomes` adds correct/attempts per topic (pure — inputs unmutated); crossing 15
  correct on a topic unlocks exactly that topic's blueprint id (deduped, sorted, idempotent on refold).
- **parse round-trip:** `parseMasteryStore(JSON.stringify(store)) deep-equals store`; null/garbage/
  wrong-version/missing-topic/NaN → `EMPTY_MASTERY_STORE`; blueprints normalized (dedupe+sort).
- **combat outcomes:** a scripted fight with N correct + M wrong of a topic yields
  `result.topicOutcomes[topic] === {correct:N, attempts:N+M}`; a **skip** adds no attempt; wrong-then-
  requeue-then-correct counts 2 attempts / 1 correct.
- **elite gate:** `generateMap(rng)` (default) has an elite; `generateMap(rng,{eliteUnlocked:false})`
  has NONE (and is still a valid connected DAG, boss reachable — reuse the existing DAG invariant
  helper); the driver with an empty store generates no elite, with a tier-2+ store generates one.
- **blueprint loot:** `rollLoot(rng, tier, [bpItem])` can offer the blueprint item; `rollLoot(rng,tier)`
  (no extra) is byte-identical to before; still 3 distinct.
- **persistence across death:** script a run to a LOSS accruing topic outcomes → `run.mastery` reflects
  them → `newRun()` KEEPS them (mastery unchanged) while xp/level/stats/inventory/lifelines reset.
- **determinism guard:** same (seed, mastery, command script) → identical snapshots + identical map
  (incl. elite presence) + identical loot.
- **regression:** every existing combat/map/loot/progression/lifeline/sim-bootstrap test passes; where
  a bootstrap test assumed elite-always-present, pass a high-mastery store (or assert the new
  empty-store behavior) — update it HONESTLY, with a comment, not by weakening it.

## Verify gate (controller runs, not the executor)
`npm run typecheck` (whole workspace) + `npm run test -w @mathquest/sim-core` + `-w @mathquest/client`
+ `@engine/core` palette test. Confirm `git status` touched only `games/mathquest/**` (+ this brief).
Grep clean of `Math.random`/`Date.now`/raw hex in new code. Then the controller **plays it in the
browser** (`npm run mathquest`): confirm mastery accrues and DISPLAYS, survives a `new-run` (and a
death), persists across a **page reload** (localStorage round-trip — the real integration proof), and
that a high-mastery store unlocks the elite branch. (Integration, not just green tests — the standing
lesson.)

## Not in scope (defer)
"Unlock new problem types" (needs V–VIII generators — post-M5); companion (Archer/Mage) gear; a
dedicated full-screen mastery/progress UI; cloud/multi-profile saves; store migrations beyond v1
validate-or-reset. (Then M5 — folklore art + full RO/EN i18n toggle — closes the milestone plan.)
