# MateQuest — M3: map & runs (brief)

status: ready
milestone: M3 (see corpus/todos/2026-07-21-mathquest-BUILD-STATE.md)
design-of-record: corpus/wiki/mathquest-overview.md
builds on: M2 problem-generator seam (branch `mathquest`, committed)

**Goal:** wrap the M2 combat in a **run** — a deterministic **branching node map** (Slay-the-Spire /
Mewgenics) you traverse with **easy/hard bifurcations**, warrior HP that **persists across fights**,
and a **soft-roguelike** end: a party wipe returns you home (start a new run), beating the **boss**
wins the run. Difficulty is now driven by **which branch you take** (harder branch = higher grade +
tougher enemy + — later — better loot), replacing M2's manual grade selector. Loot/progression is M4;
folklore art is M5.

## Determinism (load-bearing)
The whole map (topology, node types, grades, enemy rolls) is generated from the run seed via named
`rng.fork(label)` — no `Math.random`/`Date.now`. Same (seed, command sequence) ⇒ identical run.
Required determinism test.

## Part A — sim-core: the run layer over combat

### A0. Refactor: extract combat into a reusable factory
Right now combat lives inline in `bootstrapMathquestSim`'s closure. Extract it to
`combat/combat.ts` as `createCombat(opts): Combat` where:
```ts
export interface CombatOpts {
  readonly rng: Rng;                 // the run forks a per-fight child and hands it in
  readonly grade: Grade;             // this fight's difficulty (from the node)
  readonly warriorHp: number;        // carried in from the run (persists across fights)
  readonly warriorMaxHp: number;
  readonly enemy: EnemyArchetype;    // name + maxHp + intent range (see A2)
}
export interface Combat {
  chooseAction(a: CombatAction): void;
  submitAnswer(r: AnswerResponse): void;
  acknowledgeTeach(): void;
  snapshot(): CombatSnapshot;        // the M2 CombatSnapshot, unchanged shape
  /** null while fighting; set once the fight ends. */
  result(): { readonly outcome: "won" | "lost"; readonly warriorHp: number } | null;
}
```
Move `applyAction`/`runEnemyTurn`/`initialCombatState`/`projectSnapshot`/the teach+re-queue logic
into this factory. `CombatSnapshot` keeps its M2 shape (warrior HP now comes from `warriorHp` in and
is reported back out via `result().warriorHp`). The M2 combat tests move/adapt to drive `createCombat`
directly (keep them strong).

### A1. Map model (`run/map.ts`)
```ts
export type NodeType = "combat" | "elite" | "rest" | "boss";
export interface MapNode {
  readonly id: number;
  readonly type: NodeType;
  readonly row: number;             // 0 = first choosable row; boss is the last row
  readonly col: number;             // for client layout
  readonly grade: Grade;            // fight difficulty (ignored for "rest")
  readonly next: readonly number[]; // ids reachable from this node (empty for boss)
}
export interface RunMap {
  readonly nodes: readonly MapNode[];
  readonly startIds: readonly number[]; // row-0 node ids (the first choice)
  readonly bossId: number;
}
export function generateMap(rng: Rng): RunMap;
```
Generation rules (exact algorithm is yours; these invariants are required + tested):
- ~6 rows of 2–3 nodes each (≈10–14 non-boss nodes) + a single **boss** node in a final row.
- **Connected DAG:** every non-boss node has ≥1 `next`; every node in row r+1 has ≥1 incoming from row
  r; all row-(last) nodes connect to the boss. From any start node the boss is reachable.
- **Branches exist:** at least some rows have ≥2 nodes with differing `grade`/`type` (the easy/hard
  fork). Mark the harder node in a branching row as `"elite"`.
- **Grades escalate with depth:** rows 0–1 → grade 1–2, rows 2–3 → 2–3, rows 4–5 → 3–4; `elite` = row
  base +1 (capped at 4); boss grade = 4.
- **≥1 `rest` node** somewhere in the middle rows.

### A2. Enemy archetypes (`run/enemies.ts` or combat/constants)
```ts
export interface EnemyArchetype { readonly name: string; readonly maxHp: number; readonly intentBase: number; readonly intentRoll: number; }
```
- `combat` → "Zmeu pui", 24 hp, intent 5–8 (base 5, roll 4).
- `elite`  → "Balaur", 34 hp, intent 7–10.
- `boss`   → "Zmeu bătrân", 44 hp, intent 8–11.
(Provisional balance — note it as tunable. `rest` has no enemy.)

### A3. Run state machine (`sim-bootstrap.ts` becomes the run driver)
`bootstrapMathquestSim({ seed })` now drives a RUN, not a single fight:
```ts
export type RunMode = "map" | "combat" | "run_won" | "run_lost";
```
State: the `RunMap`, `warriorHp` (starts full = 30, persists across fights), `currentId` (null at
start), `reachableIds` (row-0 `startIds` at start; after finishing a node, its `next`), `visitedIds`,
`mode`, and the active `Combat | null`.

Commands on `BootedMathquestSim` (replacing the old top-level combat commands):
- `chooseNode(id)` — valid in `"map"` and only if `id ∈ reachableIds`. `rest` → heal (`+REST_HEAL`,
  capped at max), mark visited, advance `reachableIds = node.next`, stay in `"map"` (or go `run_won`
  if a rest were terminal — it isn't). `combat`/`elite`/`boss` → create a `Combat` via
  `rng.fork(`node:${id}`)` with the node's grade + archetype + current `warriorHp`, set `mode="combat"`.
- `chooseAction`/`submitAnswer`/`acknowledgeTeach` — forwarded to the active `Combat` while
  `mode==="combat"`; ignored otherwise. After each, check `combat.result()`:
  - `won` → save `warriorHp`; if the node was the boss → `mode="run_won"`; else mark visited, set
    `reachableIds = node.next`, `mode="map"`.
  - `lost` → `mode="run_lost"`.
- `newRun()` — valid in `run_won`/`run_lost`: regenerate the map from a fresh fork
  (`rng.fork(`run:${runCount}`)`), reset `warriorHp` to full, `mode="map"`. (M3: no meta-progression
  carried yet — that's M4. Just a clean restart.)

Keep `world`/`scheduler`/`step()` present (still a no-op tick) for shape-compatibility.

### A4. Top-level snapshot (`getSnapshot()` now returns a `GameSnapshot`)
```ts
export interface RunView {
  readonly map: RunMap;
  readonly currentId: number | null;
  readonly reachableIds: readonly number[];
  readonly visitedIds: readonly number[];
  readonly warriorHp: number;
  readonly warriorMaxHp: number;
}
export type GameSnapshot =
  | { readonly mode: "map";       readonly run: RunView }
  | { readonly mode: "combat";    readonly run: RunView; readonly combat: CombatSnapshot }
  | { readonly mode: "run_won";   readonly run: RunView }
  | { readonly mode: "run_lost";  readonly run: RunView };
```
(The `answer`/`answerIndex` non-leak invariant from M2 still holds — `combat` is the M2 snapshot.)

### A5. sim-core tests (strong assertions)
- `generateMap`: deterministic; connected DAG (boss reachable from every start; no dangling nodes);
  grades escalate; ≥1 elite branch; ≥1 rest; boss is the unique terminal node.
- Run flow: `chooseNode` into a combat → `mode="combat"`; winning it → back to `"map"` with
  `warriorHp` persisted (a fight that cost HP shows lower HP on the next map view) and `reachableIds`
  = that node's `next`; a `rest` node heals; losing a fight → `"run_lost"`; beating the boss →
  `"run_won"`; `newRun()` resets HP + map.
- `chooseNode` rejects an unreachable id (no state change).
- Determinism: same seed + same command script ⇒ identical `GameSnapshot` sequence.

## Part B — client: map screen + run-over screen (combat screen reused)

`main.ts` now switches rendering by `snapshot.mode`:
- **`"map"`** → a new `ui/map-screen.ts`: render the nodes laid out by row (row 0 at the bottom or
  top — your call, keep it readable) and column. Each node is a button labelled by type + grade (e.g.
  "⚔ G2", "★ Elite G3", "☾ Rest", "☠ Boss G4"), colored by type via `MATE_PAL.*`. **Reachable** nodes
  are enabled + highlighted; non-reachable are disabled/dimmed; visited are marked. Clicking a
  reachable node posts `choose-node`. Show the warrior HP bar (persists) + a small legend. Draw edges
  between rows as thin `UISurface.rect` lines if practical (nice-to-have; adjacency-by-column is an
  acceptable fallback — say so in a comment if you skip edges).
- **`"combat"`** → the existing `ui/combat-screen.ts` (remove the manual grade selector — grade now
  comes from the node; you may show the current grade read-only). Warrior HP is the run's persisted HP.
- **`"run_won"` / `"run_lost"`** → a `ui/run-over-screen.ts`: a banner ("Ai învins!" / "Ai pierdut")
  + a **New run** ("Rulare nouă") button → posts `new-run`.
- Worker command channel: `WorkerInbound` becomes `init` · `choose-node{id}` · `choose-action` ·
  `submit-answer{response}` · `acknowledge-teach` · `new-run`. Outbound `ready`/`snapshot` with the new
  `GameSnapshot`. One `InputDispatcher` over whichever screen root is current (swap the root-provider
  by mode, mirroring how combat-screen swaps its dynamic subtree).
- Client tests (jsdom): a `map` snapshot builds one button per node with reachable ones enabled; a
  `run_won` snapshot builds the banner + New-run button; combat still renders in `combat` mode.

## Acceptance / verify (controller runs these)
1. `npm run typecheck` — green. 2. `npm run test -w @mathquest/sim-core` — green.
3. `npm run test -w @mathquest/client` — green. 4. `npm run test -w @engine/core -- src/render/palette.test.ts` — green.
5. `npm run mathquest` (:5176) — **user playtests**: pick a start node → fight → win → return to the
   map with HP carried over → choose an easy vs hard branch (hard = higher grade/tougher enemy) → hit
   a rest node (heals) → reach + beat the boss (Victory) OR wipe (Defeat) → New run starts fresh.
Do NOT run the full repo suite or any determinism/EXPORT sweep.

## Hard rules
- No destructive git; do NOT commit (controller integrates). Edit ONLY under `games/mathquest/`; do
  NOT edit `engine/`/`@engine/ui` (STOP + report if you think you must).
- No raw hex (`MATE_PAL.*` only); no `Math.random`/`Date.now` in sim-core.
- Reuse the M1/M2 patterns (retained tree + refresh + drawBars; worker command channel; the a11y
  mirror + input dispatcher in `main.ts`). Use REAL engine APIs; don't invent.
- Keep the M2 combat behavior intact through the refactor (its tests must still pass, adapted to
  `createCombat`).

## Report back (final message = report to controller)
(1) files changed; (2) final pass/fail of each verify command; (3) the FULL contract as implemented
(worker messages + `GameSnapshot` + `RunMap`/`MapNode` shapes + sim commands); (4) deviations + why;
(5) precise browser steps to: start a run, win a fight and see HP persist, take a hard branch, rest,
and reach both a boss win and a wipe→new-run.
