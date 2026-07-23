# MateQuest M4b — math lifelines (hint / 50-50 / skip)

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-07-23
design-of-record: [../wiki/mathquest-overview.md](../wiki/mathquest-overview.md) · tracker: [2026-07-21-mathquest-BUILD-STATE.md](2026-07-21-mathquest-BUILD-STATE.md) · builds on M4a: [2026-07-23-mathquest-M4a-progression-loot.md](2026-07-23-mathquest-M4a-progression-loot.md)

## Scope (M4b only — read this boundary carefully)

M4 has three shippable slices. **This brief is M4b only:**
- **M4a (done, `8c9f722`):** in-run XP → level-up, and loot → equipment granting **stat bonuses**.
- **M4b (this):** the signature **math lifelines** — Who-Wants-to-Be-a-Millionaire-style consumables
  the player spends DURING a fight to get help on the current problem. Three kinds: **hint**,
  **fifty** (50-50), **skip**. Charges start from a small kit AND are granted by loot. All in-run
  (reset per run), deterministic, unit-tested.
- **M4c (NOT now):** **persistent** per-topic mastery (localStorage), hard-branch gating, blueprints.

Do **not** build persistence here. Everything M4b adds resets on `newRun()`, exactly like M4a's
xp/level/stats/inventory.

## Constraints (carry into the work — from the tracker; identical to M4a)
- **Determinism load-bearing.** All randomness via `rng.fork(label)` — never `Math.random`/`Date.now`.
  `Rng.fork` consumes a parent draw, so the ORDER of forks must be identical for the same command
  script. You may ADD a new named fork (`"fifty"`, on the COMBAT rng — see below); **do not reorder**
  the existing driver forks (`map`, `run:${n}`, `node:${id}`, `levelup`, `loot`) or the existing
  combat forks (`intent`, `topic`, `problem`).
- **Answer non-leak invariant stays.** `answer`/`answerIndex` NEVER cross the snapshot boundary.
  50-50 exposes only WRONG choice indices to disable (never the answer index, never the answer).
- **Palette:** every colour via `MATE_PAL.*` (no raw hex). **RO by default** — all new UI strings go in
  `client/src/strings.ts` (Romanian); lifeline ITEM names may live in `run/loot.ts` (sim-side content,
  like generator prompts), matching M4a's loot naming.
- **No `.js` suffixes; TS strict; pinned versions.** Don't commit (controller integrates). No
  `git reset`/`checkout`/`stash`.
- Narrowest test scope while working (`-w @mathquest/sim-core`, `-w @mathquest/client`); **do NOT run
  determinism/EXPORT checks** (the controller asks the user) or the full repo suite.

## Current seams (already built — integrate with these, don't reshape)
Read these first; M4b threads through all of them exactly like M4a did:
- `sim-core/src/combat/combat.ts` — `createCombat(opts): Combat`. The fight state machine
  (`chooseAction`/`submitAnswer`/`acknowledgeTeach`/`snapshot`/`result`). `state.pendingAction`/
  `state.pendingProblem` are set in `chooseAction`, consumed in `submitAnswer`. `toProblemView` is
  the ONE narrowing point. `applyAction`/`runEnemyTurn` are the effect helpers a **skip** reuses.
- `sim-core/src/combat/types.ts` — `CombatSnapshot`, `ProblemView` (typed | choice), `Problem`.
- `sim-core/src/run/loot.ts` — `Item` (has the `// M4b:` hook comment), `ItemView`/`toItemView`,
  `COMMON_POOL`/`BETTER_POOL`, `rollLoot`, `foldItemBonus`.
- `sim-core/src/run/progression.ts` — `StatBonuses`/`ZERO_STATS` (pattern to mirror for the lifeline
  charge record).
- `sim-core/src/sim-bootstrap.ts` — the run driver. Closed-over state; `RunView`; `GameSnapshot`
  (discriminated by `mode`); `chooseLoot` (where a picked item's effects are folded in); `newRun`
  (where everything resets); `getSnapshot`.
- `client/src/ui/combat-screen.ts` — the retained combat widget tree + per-frame `refresh`.
- `client/src/worker/sim-worker.ts` — the command channel.
- `client/src/main.ts` — mode-aware render loop + input; `combatActions` (incl. `submitChoice`).
- `client/src/strings.ts` — RO strings.

## LOCKED mechanics (implement exactly — controller-decided so it's deterministic + testable)

### The three lifelines
`type LifelineKind = "hint" | "fifty" | "skip"`. Define in a NEW `sim-core/src/run/lifelines.ts`
alongside `const LIFELINE_KINDS: readonly LifelineKind[] = ["hint", "fifty", "skip"]` and the charge
record type + starting kit:
```ts
export type LifelineCharges = Record<LifelineKind, number>;
export const STARTING_LIFELINES: LifelineCharges = { hint: 1, fifty: 1, skip: 1 };
export const NO_LIFELINES: LifelineCharges = { hint: 0, fifty: 0, skip: 0 };
```
(Starting kit = 1 of each: a tutorial freebie that makes the feature immediately demonstrable; loot
grants more. Resets to `STARTING_LIFELINES` on `newRun()`.)

Behaviour of each, applied to the CURRENT pending problem while the fight is in `await_answer`:
- **hint** — reveal the problem's worked step (its existing `Problem.teach` text) as an on-screen
  hint. The player still types/picks the answer and still earns XP on a correct solve. Applies to
  BOTH typed and choice problems.
- **fifty** — only meaningful for **choice** problems (comparison). Disables one WRONG choice, leaving
  the correct one + one wrong one active (3 → 2). For **typed** problems it does not apply (no-op,
  charge NOT spent — the button is disabled in the UI for typed problems). Which wrong choice to
  disable is chosen deterministically via `rng.fork("fifty")` on the COMBAT rng.
- **skip** — auto-lands the pending action as if answered correctly (attack/heal/shield resolves,
  then the enemy takes its turn), but earns **0 XP** (it was not solved). Applies to both input types.
  Like a killing correct answer, a skip-Attack that drops the enemy to 0 ends the fight with no enemy
  turn (reuse the exact `submitAnswer` correct-branch sequencing, minus the `xpEarned` accrual).

### Combat changes (`combat/combat.ts` + `combat/types.ts`)
- `Combat` gains `useLifeline(kind: LifelineKind): boolean` — returns `true` iff the lifeline was
  actually APPLIED (so the driver knows whether to spend a charge). Returns `false` (no state change)
  when: not in `await_answer`; `fifty` on a typed problem; `hint`/`fifty` already applied to THIS
  problem (don't let a second use waste a charge — idempotent per problem).
- New `CombatState` fields (reset whenever a NEW problem is set — i.e. in `chooseAction` right after
  `state.pendingProblem = nextProblem()`, so a re-queued/next problem starts clean):
  `hintText: string | null` (set to `problem.teach` on a hint), `fiftyDisabled: number[] | null`
  (the wrong indices disabled by a fifty; `null` until used).
- `useLifeline` logic:
  - `hint`: if `phase !== "await_answer" || pendingProblem === null` → false. If `hintText !== null`
    → false (already hinted). Else `hintText = pendingProblem.teach`; return true.
  - `fifty`: if `phase !== "await_answer" || pendingProblem === null` → false. If
    `pendingProblem.kind !== "choice"` → false. If `fiftyDisabled !== null` → false. Else compute the
    wrong indices `= [0..choices.length) minus answerIndex`, pick ONE of them via `rng.fork("fifty")`
    (`.pick(...)` or `.int(...)`), set `fiftyDisabled = [thatWrongIndex]`; return true. (For 3 choices
    this leaves the correct + one wrong active — a true 50-50. Generalises if a topic ever has >3
    choices: disable all-but-two by dropping `count-2` wrong indices — but comparison is always 3, so
    dropping exactly one wrong index is the concrete requirement now.)
  - `skip`: if `phase !== "await_answer" || pendingAction === null || pendingProblem === null` → false.
    Else run the correct-branch effect WITHOUT xp: `applyAction(pendingAction)` → `lastPlayer =
    {kind:"landed", action, amount}`; clear `pendingAction`/`pendingProblem`/`hintText`/`fiftyDisabled`;
    if `enemyHp <= 0` → `phase="won"`, `turn++`; else `runEnemyTurn()`. Return true.
- `ProblemView` (choice variant) gains `disabledChoices: readonly number[]` — the indices the client
  should render inert. **Empty array** in the base case (no fifty used). `toProblemView` fills it from
  `state.fiftyDisabled ?? []` (only for the choice branch; typed has no such field). This lists only
  NON-answer indices — the non-leak invariant holds (still never emits `answerIndex`/`answer`).
- `CombatSnapshot` gains `hint: string | null` — mirrors `state.hintText` (null outside
  `await_answer`, or when no hint was used for the current problem). Set it in `snapshot()`.
- **Zero-behaviour-change guarantee:** a fight where `useLifeline` is never called must be
  byte-identical to M4a — `disabledChoices` is always `[]`, `hint` always `null`, no `"fifty"` fork is
  ever consumed. Existing combat tests must pass unchanged.

### Loot changes (`run/loot.ts`)
- Extend `Item` (replace the `// M4b:` hook comment) with an OPTIONAL lifeline grant:
  `readonly lifeline?: { readonly kind: LifelineKind; readonly charges: number }`.
- `ItemView` gains the same optional `lifeline` field; `toItemView` copies it through (it is not a
  secret — it is display-relevant, and the loot card shows it).
- Add ~3 lifeline items to the pools (RO names, sim-side content is fine):
  - COMMON_POOL: `{ id:"pergament-indicii", name:"Pergament cu indicii", bonus:{}, lifeline:{kind:"hint", charges:2} }`
  - COMMON_POOL: `{ id:"ochi-ager", name:"Ochi ager", bonus:{}, lifeline:{kind:"fifty", charges:1} }`
  - BETTER_POOL: `{ id:"clopotel-fermecat", name:"Clopoțel fermecat", bonus:{}, lifeline:{kind:"skip", charges:1} }`
  (`bonus:{}` = pure lifeline items; the existing stat items are unchanged. Distinctness in `rollLoot`
  is by `id`, already handled — the pool just grew, its logic is untouched.)
- `rollLoot` LOGIC is unchanged. Only the pools grew. Re-check the existing sampled "better-pool
  skew" test still holds with the larger pools (adjust the sample expectation only if it now fails for
  a legitimate reason — document why in the test comment; do not weaken it into a tautology).

### Driver changes (`sim-bootstrap.ts`)
- Run state: `let lifelines: LifelineCharges = { ...STARTING_LIFELINES }` (spread — never alias the
  const). Reset to `{ ...STARTING_LIFELINES }` in `newRun()`.
- `chooseLoot(index)`: when a real item is taken (the `index !== -1` branch), in addition to folding
  `item.bonus` into `stats`, if `item.lifeline` is present, add its charges:
  `lifelines = { ...lifelines, [item.lifeline.kind]: lifelines[item.lifeline.kind] + item.lifeline.charges }`.
- New command `useLifeline(kind: LifelineKind): void` on `BootedMathquestSim`:
  ```
  if (mode !== "combat" || combat === null) return;   // ignore off-mode
  if (lifelines[kind] <= 0) return;                    // no charges — no-op
  const applied = combat.useLifeline(kind);
  if (applied) lifelines = { ...lifelines, [kind]: lifelines[kind] - 1 };
  resolveCombatIfOver();                               // a skip may have ended the fight
  ```
  (Charge is spent ONLY when combat reports it applied — a fifty on a typed problem, or a repeat hint,
  spends nothing.)
- `RunView` gains `readonly lifelines: LifelineCharges`. Populate it in `getSnapshot` (send a copy:
  `lifelines: { ...lifelines }`).
- Export `LifelineKind`/`LifelineCharges` from `sim-bootstrap.ts` (re-export block) like the other
  run/combat types, so the client imports them from `@mathquest/sim-core`.

### Worker (`worker/sim-worker.ts`)
- Inbound `{ type: "use-lifeline"; kind: LifelineKind }` → `sim?.useLifeline(msg.kind); postSnapshot();`
  (mirror the existing `choose-level-up`/`choose-loot` cases). Add to the `WorkerInbound` union +
  message interface. Outbound unchanged.

### Client — combat screen (`ui/combat-screen.ts`) + `main.ts` + `strings.ts`
- **Lifeline bar:** in `await_answer`, show a row of three buttons under the problem panel — "Indiciu",
  "50-50", "Sări" — each with its remaining-charge count appended (RO labels + a formatter in
  `strings.ts`; e.g. `lifelineLabel(kind, n)` → `"Indiciu (1)"`). A button is `state:"disabled"` when:
  its charge is 0; OR it is `fifty` and the current problem is `typed`; OR (for hint/fifty) it has
  already been used on the current problem (hint used ⇒ `snapshot.hint !== null`; fifty used ⇒
  `problem.disabledChoices.length > 0`). Otherwise `state:"normal"`. Wire each button's `onActivate`
  to a new action `useLifeline(kind)`. Build the three buttons ONCE (like the keypad); mutate
  `label`/`state` per refresh.
- **Hint display:** when `snapshot.hint !== null`, show it as a labelled line inside the problem panel
  (e.g. a `hintLbl` styled like the teach text, prefixed with a RO "Indiciu:" from `strings.ts`);
  hidden (removed from children, not just blanked) otherwise.
- **50-50 rendering:** for a choice problem, set each choice button's `state` to `"disabled"` when its
  index is in `problem.disabledChoices`, else `"normal"` (in the existing choice-button rebind loop).
  Because a disabled button is already inert + Tab-skipped + a11y-reflected (`@engine/ui`), no extra
  guard is needed — but ALSO harden `main.ts`'s `submitChoice(index)` to ignore a disabled index
  (read `latest.combat.problem.disabledChoices`) so a keyboard/edge path can't submit a disabled
  choice.
- `combat-screen.ts` `refresh` signature gains the run's lifeline charges:
  `refresh(snapshot: CombatSnapshot, typedValue: string, lifelines: LifelineCharges): boolean`.
  `main.ts` passes `snapshot.run.lifelines`.
- `main.ts`: add `useLifeline(kind)` to `CombatScreenActions` → `post({ type:"use-lifeline", kind })`.
  When choosing a fresh action (`chooseAction`), nothing extra to reset client-side (the sim resets
  hint/fifty per problem; `typedValue` reset already happens).
- `strings.ts`: `lifelineName: Record<LifelineKind,string>` (`hint:"Indiciu"`, `fifty:"50-50"`,
  `skip:"Sări"`), `lifelineLabel(kind, n)` → `"{name} ({n})"`, and `hintPrefix: "Indiciu:"`. Also add
  a compact lifeline readout to the loot card's bonus summary IF the item is a pure lifeline item
  (`bonusSummary` returns "" for `bonus:{}` — so the loot card must ALSO show a lifeline line: add
  `lifelineSummary(item.lifeline)` → e.g. `"+2 Indiciu"`, shown when `item.lifeline` is present, so a
  pure-lifeline loot card isn't blank). Wire this into `ui/loot-screen.ts`'s card refresh.

## Tests (sim-core; extend `combat/combat.test.ts` + `run/*.test.ts` + `sim-bootstrap.test.ts`)
Mirror M4a's test style (drive the public API; assert real behaviour, not stubs):
- **hint:** in `await_answer`, `useLifeline("hint")` returns true, snapshot `hint === problem.teach`;
  a second `useLifeline("hint")` on the same problem returns false (no double-spend). A correct solve
  after a hint still accrues XP (grade). hint outside `await_answer` returns false.
- **fifty (choice):** on a comparison problem, `useLifeline("fifty")` returns true; snapshot
  `problem.disabledChoices` has length 1, does NOT contain the answer index (assert by solving the
  still-correct choice and seeing the action land), and the two active choices include the correct
  one. Deterministic: same seed+script ⇒ same disabled index. Second fifty on same problem → false.
- **fifty (typed):** `useLifeline("fifty")` on a typed problem returns false and does not change the
  snapshot; the driver spends NO charge (assert `run.lifelines.fifty` unchanged).
- **skip:** `useLifeline("skip")` in `await_answer` lands the pending action (enemy HP drops for an
  Attack / warrior heals / block set), earns 0 XP (assert `run.xp` unchanged vs. a correct solve), and
  a skip-Attack that would kill ends the fight with `outcome:"won"` and NO enemy turn. skip when no
  action is pending (`await_action`) → false.
- **charge economy:** starting kit is `{hint:1,fifty:1,skip:1}`; each successful use decrements exactly
  that kind by 1; a use at 0 charges is a no-op returning early (charge stays 0, combat unaffected);
  taking a lifeline loot item adds its charges; `newRun()` resets to `STARTING_LIFELINES`.
- **loot:** `toItemView` carries `lifeline` through; a lifeline item folds charges (not stats) into the
  run; `rollLoot` still returns 3 distinct offers with the enlarged pools.
- **determinism guard:** same (seed, command script incl. lifeline uses) ⇒ identical snapshots/charges.
- **regression / zero-change:** every existing combat/map/run/progression test passes unchanged; a
  fight that never calls `useLifeline` has `disabledChoices:[]` and `hint:null` throughout and is
  byte-identical to M4a (the `"fifty"` fork is never consumed).

## Verify gate (controller runs, not the executor)
`npm run typecheck` (whole workspace) + `npm run test -w @mathquest/sim-core` (narrow) +
`npm run test -w @mathquest/client` + `@engine/core` palette test. Confirm `git status` touched only
`games/mathquest/**` (+ this brief). Grep clean of `Math.random`/`Date.now`/raw hex in new code. Then
the controller **plays it in the browser** (`npm run mathquest`): win a fight, take a lifeline loot
item, enter the next fight, and confirm hint reveals the worked step, 50-50 greys one wrong choice,
skip lands an action for 0 XP, and charges decrement + display correctly. (Integration, not just green
tests — the standing lesson.)

## Not in scope (defer)
Persistence / mastery / gating / blueprints (M4c); companion (Archer/Mage) gear; V–VIII generators;
a "+time" lifeline (there is no timer in the sim); an a11y DOM mirror for the map.
