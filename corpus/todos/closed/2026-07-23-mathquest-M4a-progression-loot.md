# MateQuest M4a — in-run progression + loot/equipment (stat bonuses)

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-07-23
design-of-record: [../wiki/mathquest-overview.md](../../wiki/mathquest-overview.md) · tracker: [2026-07-21-mathquest-BUILD-STATE.md](../2026-07-21-mathquest-BUILD-STATE.md)

## Scope (M4a only — read this boundary carefully)

M4 splits into three shippable slices. **This brief is M4a only:**
- **M4a (this):** in-run **XP → level-up choice**, and **loot → equipment** that grants **combat STAT
  bonuses** (atk / maxHp / block / heal). Both reset per run. All in-sim, deterministic, unit-tested.
- **M4b (NOT now):** math **lifelines** (hint / 50-50 / skip) granted by gear.
- **M4c (NOT now):** **persistent** per-topic mastery (localStorage), hard-branch gating, blueprints.

Do **not** build lifelines or persistence here. Design the item type so a later `lifeline?` field can
be added without reshaping it (leave a `// M4b:` note), but ship only stat bonuses now.

## Constraints (carry into the work — from the tracker)
- **Determinism load-bearing.** All randomness via `rng.fork(label)` — never `Math.random`/`Date.now`.
  `Rng.fork` consumes a parent draw, so the ORDER of forks must be identical for the same command
  script. Add named forks; don't reorder existing ones (`map`, `run:${n}`, `node:${id}`).
- **Palette:** every colour via `MATE_PAL.*` (no raw hex). **RO by default** — all new UI strings go in
  `client/src/strings.ts` (Romanian), never inline literals.
- **No `.js` suffixes; TS strict; pinned versions.** Don't commit (controller integrates). No
  `git reset`/`checkout`/`stash`.
- **Answer non-leak invariant stays:** `answer`/`answerIndex` never cross the snapshot boundary.
- Narrowest test scope while working (`-w @mathquest/sim-core`); **do NOT run determinism/EXPORT
  checks** (ask the user) or the full repo suite.

## Current seams (already built — integrate with these, don't reshape)
- `sim-core/src/sim-bootstrap.ts` — the run driver. `bootstrapMathquestSim({seed})` returns
  `{world,scheduler,rng,step(),getSnapshot(),chooseNode(id),chooseAction,submitAnswer,
  acknowledgeTeach,newRun()}`. Run state (xp/level/stats/inventory go here) is plain closed-over
  state. `RunMode = "map"|"combat"|"run_won"|"run_lost"`. `GameSnapshot` is discriminated by `mode`;
  `RunView` carries map/currentId/reachableIds/visitedIds/warriorHp/warriorMaxHp.
  `resolveCombatIfOver()` is where a fight's end is handled — the hook point for xp/level-up/loot.
- `sim-core/src/combat/combat.ts` — `createCombat(opts: CombatOpts): Combat`. `CombatOpts` has
  `{rng,grade,warriorHp,warriorMaxHp,enemy}`. `CombatResult = {outcome:"won"|"lost"; warriorHp}`.
  Stat constants: `combat/constants.ts` `ATTACK_DAMAGE`, `HEAL_AMOUNT`, `SHIELD_BLOCK`, `WARRIOR_MAX_HP`.
- `client/src/worker/sim-worker.ts` — command channel (inbound `init`/`choose-node`/`choose-action`/
  `submit-answer`/`acknowledge-teach`/`new-run`; outbound `ready`/`snapshot`). Mirror the existing
  message shapes when adding commands.
- `client/src/main.ts` — mode-aware render loop; combat/run-over use the `@engine/ui` widget tree +
  a11y mirror; the map is custom-drawn (`ui/map-screen.ts`). Add the two new screens like
  `run-over-screen.ts` (widget tree so they get the a11y mirror for free).

## LOCKED mechanics (implement exactly — controller-decided so it's deterministic + testable)

### Stat bonuses (accumulated on the run)
`interface StatBonuses { atk: number; maxHp: number; block: number; heal: number }` — all start 0,
reset to 0 on `newRun()`. The run's effective numbers:
- effective maxHp = `WARRIOR_MAX_HP + stats.maxHp`
- combat uses `ATTACK_DAMAGE + stats.atk`, `SHIELD_BLOCK + stats.block`, `HEAL_AMOUNT + stats.heal`.

`CombatOpts` gains `mods: StatBonuses`. `createCombat` applies them (attack/heal/shield/maxHp). Keep
the M1–M3 behaviour identical when `mods` is all-zero (existing tests must still pass — pass a
zero-mods default from any existing call sites/tests, or make `mods` optional defaulting to zeroes).

### XP + level-up (in-run, resets per run)
New `sim-core/src/run/progression.ts`:
- `xpForSolve(grade: Grade): number` = `grade` (1..4) — hard branches reward more.
- Level starts at 1. To go from level L to L+1 costs `xpToNext(L) = 5 * L` (so L1→2: 5, L2→3: 10, …).
  Track cumulative `xp` and current `level`; one combat can cross several thresholds (loop).
- `type UpgradeKind = "hp" | "atk" | "block" | "heal"`.
- `UPGRADES: Record<UpgradeKind, { readonly apply: (s: StatBonuses) => StatBonuses }>` with amounts
  **hp +6, atk +2, block +3, heal +3** (pure — return a new object; hp also implies the run heals +6
  immediately, handled in the driver).
- `offerUpgrades(rng: Rng, count = 2): UpgradeKind[]` — `count` DISTINCT kinds, deterministic.

Combat must report XP earned: `CombatResult` gains `xpEarned: number` = sum of `xpForSolve(grade)` per
CORRECT solve in that fight (count correct `submitAnswer`s; grade is the fight's fixed grade). Wrong
answers earn 0.

### Loot + equipment (in-run, resets per run)
New `sim-core/src/run/loot.ts`:
- `interface Item { readonly id: string; readonly name: string; readonly bonus: Partial<StatBonuses> }`
  (`// M4b: add optional lifeline?: LifelineKind + charges here`).
- A small authored pool, split by tier. `type LootTier = "combat" | "elite" | "boss"`.
  ~4 common items (small single-stat bonuses, e.g. "Sabie ascuțită" +2 atk, "Scut de stejar" +3 block,
  "Poțiune de viață" +6 maxHp, "Amuletă" +2 heal) and ~3 better ones for elite/boss (two-stat, e.g.
  "Coif de fier" +4 maxHp +2 block). RO names in `loot.ts` are fine (sim-side content, like generator
  prompts) — but any CLIENT chrome/labels go in `strings.ts`.
- `rollLoot(rng: Rng, tier: LootTier): Item[]` — **3 distinct** offers, deterministic; elite/boss draw
  from the better pool with higher probability.

### Run flow (the sequencing — implement in the driver)
On a combat **win** (inside/after `resolveCombatIfOver`), before returning to `"map"`:
1. `xp += result.xpEarned`; loop: while `xp >= xpToNext(level)` → `xp -= xpToNext(level)`, `level++`,
   `pendingLevelUps++`.
2. `proceed()` state machine, called after the win and after each `chooseLevelUp`/`chooseLoot`:
   - if `pendingLevelUps > 0` → `mode = "level_up"`, set `levelUpOffers = offerUpgrades(rng.fork(...))`.
   - else if the won node is the **boss** → `mode = "run_won"` (no loot; run is over).
   - else if loot for this win not yet taken → `mode = "loot"`, set `lootOffers = rollLoot(fork, tier)`
     (tier from node type: combat/elite/boss).
   - else → back to `"map"` (visited += node, reachable = node.next) — the existing win path.
- `chooseLevelUp(index)`: valid only in `"level_up"`; apply `UPGRADES[offer].apply` to `stats` (hp
  upgrade also `warriorHp = min(newMax, warriorHp + 6)`), `pendingLevelUps--`, clear offers, `proceed()`.
- `chooseLoot(index)`: valid only in `"loot"`; `index === -1` skips; else add `lootOffers[index]` to
  `inventory` and fold its `bonus` into `stats` (hp bonus also heals by that amount). Mark loot taken,
  clear offers, `proceed()`.
- **Rest** nodes: unchanged (heal + stay map; no xp/loot).
- `newRun()`: reset `xp=0, level=1, stats=zero, inventory=[], pendingLevelUps=0`, offers null.
- Off-mode commands ignored (mirror the existing guards).

### Snapshot additions
- `RunView` gains: `level`, `xp`, `xpToNext` (for the current level), `stats: StatBonuses`,
  `inventory: readonly ItemView[]` (`ItemView = {id,name,bonus}` — Item has no secret fields yet, but
  add the projection now so M4b can strip lifeline internals).
- `GameSnapshot` gains two variants:
  `{ mode: "level_up"; run: RunView; offers: readonly UpgradeOffer[] }` where
  `UpgradeOffer = { kind: UpgradeKind; label: string; desc: string }` (label/desc RO, from a sim-side
  `describeUpgrade` OR from client strings — your call, but keep the answer-non-leak style: sim sends
  display-ready text) and
  `{ mode: "loot"; run: RunView; offers: readonly ItemView[] }`.
- The combat variant is unchanged.

### Worker + client
- Worker: inbound `choose-level-up {index}` → `sim.chooseLevelUp(index)`; `choose-loot {index}` →
  `sim.chooseLoot(index)`. Outbound unchanged (`snapshot`).
- `ui/levelup-screen.ts` (widget tree, like `run-over-screen.ts`): title "Ai avansat!" (RO in
  `strings.ts`), a row of buttons for the offers (label + desc), click → post `choose-level-up`.
- `ui/loot-screen.ts`: title "Pradă!" (RO), 3 item cards (name + bonus summary) + a "Sari peste" (skip)
  button → post `choose-loot` with the index or -1.
- `ui/map-screen.ts` HUD: add a compact readout of **Nivel N · XP x/y** and the current stat bonuses
  (only the non-zero ones) near the existing HP bar. Small, palette-pure, RO labels from `strings.ts`.
  Keep it inside the fixed top HUD strip; don't disturb the terrain/camera code.
- `main.ts`: handle the two new modes (swap to the new widget roots; reconcile the a11y mirror like the
  other widget screens). Keep the map custom-draw path for `"map"`.

## Tests (sim-core, `combat/*.test.ts` + a new `run/progression.test.ts` / `run/loot.test.ts`)
- **XP + level:** a scripted win with N correct solves at grade g accrues `N*g` xp; crossing 5/10/…
  thresholds queues the right number of level-ups; multi-level in one fight works.
- **Level-up applies:** choosing `atk` raises the next fight's attack damage (assert an enemy dies in
  fewer hits than baseline); `hp` raises maxHp and heals.
- **Loot:** `rollLoot` is deterministic (same seed+tier → same 3), offers are distinct, taking an item
  folds its bonus into `stats`; skip (-1) changes nothing but advances mode.
- **Flow:** win → level_up (if leveled) → loot → map, in that order; boss win → run_won (no loot);
  off-mode commands are no-ops.
- **Determinism guard:** the same (seed, command script) yields identical offers/stats (fork order).
- **Regression:** existing combat/map/run tests still pass (zero-mods parity).

## Verify gate (controller runs, not the executor)
`npm run typecheck` (whole workspace) + `npm run test -w @mathquest/sim-core` (narrow) +
`npm run test -w @mathquest/client` + `@engine/core` palette test. Confirm `git status` touched only
`games/mathquest/**` (+ this brief). Grep clean of `Math.random`/`Date.now`/raw hex in new code. Then
the controller **plays it in the browser** (`npm run mathquest`) — level-up + loot screens appear,
stats visibly change a fight — before marking done. (Integration, not just green tests — the lesson
from Phase 2/4.5.)

## Not in scope (defer)
Lifelines (M4b), persistence/mastery/gating/blueprints (M4c), companion (Archer/Mage) gear, V–VIII.
```
