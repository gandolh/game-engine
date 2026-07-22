# MateQuest — M1: turn-combat loop (brief)

status: ready
milestone: M1 (see corpus/todos/2026-07-21-mathquest-BUILD-STATE.md)
design-of-record: corpus/wiki/mathquest-overview.md
builds on: M0 scaffold (branch `mathquest`, already merged)

**Goal:** prove the game's THESIS end-to-end — *solving a math problem IS the combat action* — with a
single hardcoded problem type (simple typed arithmetic). One warrior vs one enemy, Pokémon-style
action menu + Slay-the-Spire turn stakes. **No map, no loot, no progression, no generator seam yet**
(those are M2–M4). When M1 is done you can play one fight to a win or a loss, in the browser, and the
math is what makes your attacks land.

## The core loop to build
1. **AWAIT_ACTION** — enemy shows an HP bar + a telegraphed **intent** ("⚔ 6" = it will hit for 6
   next turn). Warrior shows HP + block. Player picks one of **Attack / Heal / Shield**.
2. **AWAIT_ANSWER** — a math problem for that action appears (M1: hardcoded simple addition, e.g.
   `7 + 8 = ?`). Player types the answer (numeric keypad **and** physical keyboard) and submits.
3. **Resolve** — **correct** → the chosen action lands (Attack deals damage / Heal restores HP /
   Shield grants block); **wrong** → the action **fizzles** (no effect) + a "Fizzle!" cue.
4. **Enemy turn** — the enemy deals its telegraphed intent damage (absorbed by block first, then HP).
   Roll the next intent. Show a hit/heal/fizzle result cue.
5. Loop to AWAIT_ACTION, unless enemy HP ≤ 0 (**WON**) or warrior HP ≤ 0 (**LOST**) → show a banner.

## Determinism (load-bearing — root CLAUDE.md)
- ALL randomness (problem operands, enemy intent) via the seeded `rng` from `bootstrapMathquestSim`
  (`rng.fork(label)`); **no `Math.random`/`Date.now`** anywhere in sim-core. The worker's setInterval
  is pacing only. A given (seed, sequence of player commands) MUST produce an identical fight.
- Add a determinism test: two sims, same seed, same scripted command sequence → identical snapshots.

## Part A — sim-core (`@mathquest/sim-core`): the combat model

Replace M0's `TickCounterSystem` placeholder with a combat model. Keep `bootstrapMathquestSim({seed})`
returning the same shape, but extend it with a **command intake** + a combat-state snapshot.

Define these types (exported):
```ts
export type CombatAction = "attack" | "heal" | "shield";
export type CombatPhase = "await_action" | "await_answer" | "won" | "lost";

export interface Problem { readonly prompt: string; readonly answer: number; } // answer NOT sent to client raw — see snapshot

export interface CombatantView { readonly hp: number; readonly maxHp: number; readonly block: number; }
export interface EnemyView extends CombatantView { readonly name: string; readonly intent: number; }

export type LastResult =
  | { kind: "none" }
  | { kind: "landed"; action: CombatAction; amount: number }   // hit/heal/shield succeeded
  | { kind: "fizzle"; action: CombatAction }                    // wrong answer
  | { kind: "enemy_hit"; amount: number; blocked: number };

export interface CombatSnapshot {
  readonly phase: CombatPhase;
  readonly warrior: CombatantView;
  readonly enemy: EnemyView;
  readonly prompt: string | null;   // the problem text while in await_answer, else null. NEVER send the answer.
  readonly turn: number;
  readonly last: LastResult;
}
```

Commands the sim accepts (method on the booted sim, driven by the worker):
- `chooseAction(action: CombatAction)` — valid only in `await_action`; sets the pending action,
  generates the hardcoded problem via `rng.fork("problem")` (M1: two operands 2..9, `a + b`),
  moves to `await_answer`. (Ignore if not in `await_action`.)
- `submitAnswer(value: number)` — valid only in `await_answer`; compares to the pending problem's
  answer. Correct → apply the pending action; wrong → fizzle. Then run the enemy turn (apply
  `intent` minus `block`; block is consumed), roll next intent via `rng.fork("intent")`, update
  `last`, check win/lose, return to `await_action` (or `won`/`lost`). (Ignore if not in `await_answer`.)

Balance (fixed constants in a `combat/constants.ts`, tuned so wrong answers can kill):
- warrior maxHp 30; enemy "Zmeu pui" (baby Zmeu) maxHp 24.
- Attack (correct) deals 8. Heal (correct) restores 8 (capped at maxHp). Shield (correct) grants 8
  block (block absorbs the next enemy hit, then resets to 0 after the enemy turn).
- Enemy intent each turn: `5 + rng.int(0..3)` → 5..8. With no blocking/healing the warrior dies in
  ~4–5 turns, so repeated wrong answers are lethal — real stakes.

Update the bootstrap's `getSnapshot()` to return `CombatSnapshot`. Keep `step()` (the worker still
paces it) but combat only advances on commands — `step()` can be a no-op for M1, or just tick a
"frame" counter; the important thing is combat state changes ONLY inside `chooseAction`/`submitAnswer`
so it's fully deterministic and event-driven.

Tests (`@mathquest/sim-core`): (1) a correct attack reduces enemy HP by 8; (2) a wrong answer
fizzles (no HP change) and the enemy still hits on its turn; (3) shield absorbs the next enemy hit;
(4) enemy HP→0 ⇒ `won`, warrior HP→0 ⇒ `lost`; (5) determinism — same seed + same command script ⇒
identical snapshot sequence. Keep the `prompt` in the snapshot but assert the raw `answer` is NEVER
exposed on the snapshot.

## Part B — client (`@mathquest/client`): render + input

**Study these Citadel reference files first and mirror their patterns (do NOT copy Citadel content —
it's Apollo palette; use MATE_PAL):**
- `games/citadel/client/src/main/hud-panels.ts` — `new UISurface(renderer)`, `createInputDispatcher`, `createA11yMirror` setup.
- `games/citadel/client/src/main/input.ts` — forwarding screen-px pointer events into the dispatcher (CSS logical px coords).
- `games/citadel/client/src/ui/resource-hud.ts` — building a widget tree with **buttons wired via `onActivate`**.
- `games/citadel/client/src/ui/citadel-theme.ts` — a game-local theme object passed as `renderTree`'s 3rd arg (make a `mate-theme.ts` using `MATE_PAL.*`).
- `games/citadel/client/src/worker/sim-worker.ts` — the `self.onmessage` command-channel pattern (`type:"command"`, etc.).

Worker (`src/worker/sim-worker.ts`): extend M0's worker to accept inbound messages
`{type:"choose-action", action}` and `{type:"submit-answer", value}` → call the sim's
`chooseAction`/`submitAnswer`, then `postMessage` a fresh `{type:"snapshot", snapshot}`. Keep posting
a snapshot each paced tick too (cheap; keeps the view fresh). Define typed `WorkerInbound`/
`WorkerOutbound` unions.

Main (`src/main.ts`): replace the M0 title-only boot with the combat screen, rendered every frame via
`@engine/ui` from the latest `CombatSnapshot`:
- **Enemy area** (top): name label, an HP bar (a bg box + a fg box whose width = hp/maxHp, `MATE_PAL.red`
  fill), and the **intent telegraph** (e.g. a sword glyph/label + the number) — visible in `await_action`.
- **Warrior area** (bottom): HP bar (`MATE_PAL.green`), a block indicator when block > 0 (`MATE_PAL.skyBlue`).
- **Action menu** (in `await_action`): three buttons **Attack / Heal / Shield** → `onActivate` posts the
  matching `choose-action` command.
- **Problem panel** (in `await_answer`): the `prompt` text big, a numeric **keypad** (0–9, ⌫, Enter)
  whose buttons append/submit, showing the current typed value. ALSO accept physical keyboard
  (digits, Backspace, Enter) — wire a keydown listener that edits the same typed buffer.
- **Result cue**: render `last` (e.g. "Hit! −8", "Fizzle!", "Zmeu pui hits for 6 (2 blocked)").
- **Banner**: on `won`/`lost`, a centered banner ("Victory!" / "Defeat"); a Restart button that posts
  an `{type:"init", seed}` to re-bootstrap the fight (add an `init` handler to the worker).
- Renderer: keep M0's `createRenderer(canvas, camera, { backend: "canvas2d" })` (no WebGPU adapter in
  this sandbox — do NOT use "auto"/"webgpu").
- Centralize all user-facing strings in one small `src/strings.ts` object (EN for M1; full RO/EN i18n
  is M5) so M5 can swap them without touching widgets.

Client tests (`@mathquest/client`, jsdom): a small test that, given a `CombatSnapshot`, the tree
builder produces the expected widget structure (e.g. 3 action buttons in `await_action`; a keypad in
`await_answer`; a banner in `won`). Keep it light — the real proof is the browser playtest.

## Acceptance / verify (controller runs these)
1. `npm run typecheck` — whole workspace green.
2. `npm run test -w @mathquest/sim-core` — combat + determinism tests green.
3. `npm run test -w @mathquest/client` — tree-builder tests green.
4. `npm run test -w @engine/core -- src/render/palette.test.ts` — mathquest scope still clean (no raw hex).
5. `npm run mathquest` (:5176) — **user playtests**: pick Attack → type the sum → enemy HP drops;
   type a wrong answer → "Fizzle!" + you take damage; win and lose reachable; keypad + physical
   keyboard both work.
Do NOT run the full repo suite or any determinism/EXPORT sweep (constrained hardware).

## Hard rules
- No destructive git (`reset`/`checkout`/`stash`/`rebase`). Do NOT commit — the controller integrates.
- Edit only under `games/mathquest/`. If you think a shared file (engine/@engine/ui) needs changing,
  STOP and report — do not edit `engine/ui` (Citadel's `citadel-theme.ts` comment notes themes are
  passed in, not edited into the engine).
- No raw hex literals — every color via `MATE_PAL.*`. No `Math.random`/`Date.now` in sim-core.
- Use the REAL `@engine/ui` + `@engine/core` APIs (read the reference files); do not invent APIs.

## Report back
(1) files changed; (2) final output of each verify command; (3) the exact sim↔worker↔client message
contract you implemented; (4) deviations + why; (5) precise browser steps to see a win AND a loss.
Your final message is a report to the controller, not a human.
