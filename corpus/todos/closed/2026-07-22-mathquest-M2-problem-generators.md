# MateQuest — M2: problem-generator seam (grades I–IV) (brief)

status: ready
milestone: M2 (see corpus/todos/2026-07-21-mathquest-BUILD-STATE.md)
design-of-record: corpus/wiki/mathquest-overview.md
builds on: M1 combat loop (branch `mathquest`, committed)

**Goal:** replace M1's single hardcoded `a + b` with a real, deterministic **problem-generator
seam** keyed by **(grade, topic)** and difficulty-scaled across the Romanian curriculum **grades
I–IV**, add **mixed input** (typed computation + multiple-choice concept problems with crafted
distractors), add the **teach-card + re-queue** learning moment on a wrong answer, and fold in the
**M1 result-cue split**. This is the milestone that makes the math real and curriculum-shaped. Map,
loot, and grades V–VIII are still later.

## Scope (deliberately bounded — do NOT expand)
Four topics for M2: **addition, subtraction, multiplication** (typed) + **comparison** (multiple-
choice: `<`, `>`, `=`). Word-problems, fractions, and geometry are explicitly DEFERRED (they need
more content design) — note them as follow-ons, don't build them. The point of M2 is to prove the
**seam** (registry + difficulty + both input kinds + teach + re-queue), not breadth of content.

## Determinism (load-bearing — root CLAUDE.md)
All generation (operands, topic choice, distractor order, enemy intent) via the sim's seeded `rng`
with named `rng.fork(label)` — no `Math.random`/`Date.now`. Same (seed, command sequence) ⇒ identical
fight, including identical problems and identical MC choice ordering. Required determinism test.

## Part A — sim-core: the generator seam + combat integration

### A1. New types (in `combat/` — extend, don't rewrite from scratch)
```ts
export type Grade = 1 | 2 | 3 | 4;                                   // M2 scope; V–VIII later
export type MathTopic = "addition" | "subtraction" | "multiplication" | "comparison";
export type ProblemKind = "typed" | "choice";

// INTERNAL to sim-core (carries the answer — NEVER crosses the snapshot boundary):
interface ProblemCommon { readonly topic: MathTopic; readonly grade: Grade; readonly prompt: string; readonly teach: string; }
export interface TypedProblem  extends ProblemCommon { readonly kind: "typed";  readonly answer: number; }
export interface ChoiceProblem extends ProblemCommon { readonly kind: "choice"; readonly choices: readonly string[]; readonly answerIndex: number; }
export type Problem = TypedProblem | ChoiceProblem;

// CROSSES the boundary (no answer/answerIndex):
export type ProblemView =
  | { readonly kind: "typed";  readonly topic: MathTopic; readonly grade: Grade; readonly prompt: string }
  | { readonly kind: "choice"; readonly topic: MathTopic; readonly grade: Grade; readonly prompt: string; readonly choices: readonly string[] };

// client → sim answer:
export type AnswerResponse = { readonly kind: "typed"; readonly value: number } | { readonly kind: "choice"; readonly index: number };
```
`teach` is a short worked-step string, e.g. `"7 + 8: 7 + 3 = 10, apoi + 5 = 15"` or for comparison
`"12 > 9 pentru că 12 are mai multe zeci"`. EN is fine for M2 (RO/EN i18n is M5) but keep every
user-facing string in `strings.ts` where practical; generator-produced `prompt`/`teach` may be inline
for now (note them as M5 i18n targets).

### A2. The generators (`combat/generators.ts`)
```ts
export type ProblemGenerator = (rng: Rng, grade: Grade) => Problem;
export const GENERATORS: Record<MathTopic, ProblemGenerator>;
export const TOPICS_FOR_GRADE: Record<Grade, readonly MathTopic[]>;  // grade-valid topics
```
- **addition / subtraction (typed):** operand ranges scale by grade — g1: 1–10, g2: 1–100, g3: 2-digit
  (10–999), g4: up to ~9999 but keep the ANSWER ≤ 9999 and mentally tractable. Subtraction MUST have
  `a ≥ b` (non-negative). `teach` shows a decomposition/borrow hint.
- **multiplication (typed):** g2: tables (1–10 × 1–10); g3: 2-digit × 1-digit; g4: 2-digit × 2-digit
  but cap the product ≤ 9999. `teach` shows the table fact or a partial-products hint. **Not valid for
  g1** (Romanian curriculum introduces multiplication in clasa a II-a).
- **comparison (choice):** two numbers in the grade's range; `choices = ["<", ">", "="]` (FIXED order
  so the answer is unambiguous to author, but you MAY shuffle deterministically via `rng.fork("shuffle")`
  as long as `answerIndex` tracks the shuffle); `answerIndex` = the correct relation. `teach` explains
  place-value reasoning.
- `TOPICS_FOR_GRADE`: g1 = [addition, subtraction, comparison]; g2–g4 = [addition, subtraction,
  multiplication, comparison].

### A3. Combat integration (`sim-bootstrap.ts`)
- Track `currentGrade: Grade` (default 1) and a per-turn topic pick: on `chooseAction`, pick a topic
  via `rng.fork("topic")` from `TOPICS_FOR_GRADE[currentGrade]`, generate via `GENERATORS[topic]`
  through `rng.fork("problem")`. (Unless a re-queued problem is waiting — see A4.)
- Replace `generateProblem` usage; keep `combat/logic.ts`'s `rollEnemyIntent`.

### A4. Teach-card + re-queue (the learning moment)
- New phase: `CombatPhase = "await_action" | "await_answer" | "teach" | "won" | "lost"`.
- On `submitAnswer(response)` in `await_answer`, check correctness by problem kind:
  - typed: `response.kind==="typed" && response.value === problem.answer`
  - choice: `response.kind==="choice" && response.index === problem.answerIndex`
  - **Correct** → apply the pending action (existing logic) → enemy turn (or win) → `await_action`.
  - **Wrong** → fizzle (action does nothing) → **push the missed problem onto a FIFO re-queue**
    (`requeue: Problem[]`) so it (the SAME problem) comes back on a later turn → set `teach` text →
    phase `"teach"`. The enemy turn does NOT happen yet.
- New command `acknowledgeTeach()`: valid only in `"teach"` → run the (already-fizzled) enemy turn →
  roll next intent → `await_action` (or `lost`). This gives the player the worked step BEFORE they
  take the hit.
- On `chooseAction`, if `requeue` is non-empty, POP it for this turn's problem instead of generating
  fresh (lightweight spaced repetition). A re-queued problem the player then gets RIGHT is not
  re-queued again; wrong again → back on the queue.

### A5. Result-cue split (fold in the M1 known-minor)
Replace the single `last: LastResult` with TWO fields so the player's own action result no longer gets
overwritten by the enemy's hit:
```ts
export type PlayerResult = { kind:"none" } | { kind:"landed"; action: CombatAction; amount: number } | { kind:"fizzle"; action: CombatAction };
export type EnemyResult  = { kind:"none" } | { kind:"enemy_hit"; amount: number; blocked: number };
// snapshot: lastPlayer: PlayerResult; lastEnemy: EnemyResult;
```
Set `lastPlayer` on the player's action, `lastEnemy` on the enemy turn; reset `lastEnemy` to `{kind:"none"}`
when a new action is chosen so a stale enemy line doesn't linger into the next problem.

### A6. Snapshot + commands (contract)
`CombatSnapshot` now carries: `phase`, `warrior`, `enemy`, `problem: ProblemView | null` (replaces the
bare `prompt` — `null` outside `await_answer`), `grade: Grade`, `teach: string | null` (the worked step,
non-null only in `"teach"` phase), `turn`, `lastPlayer`, `lastEnemy`. **Never expose `answer`/`answerIndex`.**
New/changed commands on the booted sim: `chooseAction(action)`, `submitAnswer(response: AnswerResponse)`,
`acknowledgeTeach()`, `setGrade(grade: Grade)`.

### A7. sim-core tests (strong assertions — a green test that asserts nothing is worse than none)
- Each generator × each valid grade: deterministic (same seed ⇒ same problem); the `answer` is
  actually correct (compute independently); subtraction never negative; multiplication product in range;
  comparison `choices` are exactly the 3 relations and `answerIndex` names the TRUE relation.
- `TOPICS_FOR_GRADE[1]` excludes multiplication.
- Combat: a correct MC comparison lands; a wrong one → `"teach"` phase with non-null `teach`, no enemy
  damage yet; `acknowledgeTeach()` then applies the enemy hit; the missed problem is re-queued (the next
  `chooseAction` yields the SAME prompt). Typed path still works. `setGrade(3)` shows `grade:3` in the
  snapshot and subsequent problems use grade-3 ranges.
- Cue split: after a correct non-killing attack, `lastPlayer` is `landed` AND `lastEnemy` is `enemy_hit`
  in the same snapshot (the M1 overwrite bug is gone).
- Determinism: same seed + same command script ⇒ identical snapshot sequence.
- The raw `answer`/`answerIndex` is NEVER present on any snapshot (assert on the projected object).

## Part B — client: render mixed input + teach card + grade selector

Extend `ui/combat-screen.ts` + `main.ts` + `worker/sim-worker.ts` (mirror M1's patterns):
- **Problem panel** reads `snapshot.problem`:
  - `kind==="typed"` → the existing numeric keypad (submit `{kind:"typed", value}`).
  - `kind==="choice"` → render `problem.choices` as a row of buttons; clicking choice *i* submits
    `{kind:"choice", index:i}`. (No keypad in choice mode.)
- **Teach card** (phase `"teach"`): show `snapshot.teach` prominently + a **Continue** ("Mai departe")
  button → posts `acknowledge-teach`. Also show `lastPlayer` (the "Fizzle!" cue) here.
- **Grade selector**: a small row of four buttons **I / II / III / IV** → posts `set-grade`; highlight
  the current `snapshot.grade`. (This is how the player picks difficulty until M3's map branches.)
- **Result cues**: render `lastPlayer` and `lastEnemy` on SEPARATE lines (both visible) — fixes the M1 nit.
- Worker command channel: extend `WorkerInbound` with `{type:"submit-answer", response: AnswerResponse}`
  (change from the old `{value}`), `{type:"acknowledge-teach"}`, `{type:"set-grade", grade}`. Keep
  `init`/`choose-action`. Update `main.ts`'s keypad submit to send the `{kind:"typed", value}` shape;
  physical-keyboard digits/Backspace/Enter still drive the typed buffer (only meaningful in typed mode).
  Bump `MAX_ANSWER_DIGITS` in `main.ts` to 5 (grade-4 answers can be 4 digits).
- Client tests (jsdom): given a `choice` snapshot the tree builds choice buttons (not a keypad); given a
  `teach` snapshot it builds the teach card + Continue; the grade selector reflects `snapshot.grade`.

## Acceptance / verify (controller runs these)
1. `npm run typecheck` — whole workspace green.
2. `npm run test -w @mathquest/sim-core` — generators + combat + determinism green.
3. `npm run test -w @mathquest/client` — tree-builder tests green.
4. `npm run test -w @engine/core -- src/render/palette.test.ts` — mathquest scope still clean.
5. `npm run mathquest` (:5176) — **user playtests**: change grade I→IV and see harder problems;
   solve a typed problem (attack lands); get a comparison MC right/wrong; a wrong answer shows a teach
   card then you take the hit; the missed problem returns on a later turn.
Do NOT run the full repo suite or any determinism/EXPORT sweep (constrained hardware).

## Hard rules
- No destructive git (`reset`/`checkout`/`stash`/`rebase`). Do NOT commit — the controller integrates.
- Edit ONLY under `games/mathquest/`. Do NOT edit `engine/` or `@engine/ui`. If you think you must,
  STOP and report.
- No raw hex — every color via `MATE_PAL.*`. No `Math.random`/`Date.now` in sim-core.
- Use the REAL `@engine/ui`/`@engine/core` APIs (read M1's `main.ts`/`combat-screen.ts` for the
  established patterns); do not invent APIs.

## Report back (final message = report to the controller, not a human)
(1) files changed; (2) final pass/fail of each verify command; (3) the FULL sim↔worker↔client message
+ snapshot contract as implemented; (4) deviations + why; (5) precise browser steps to exercise: a
typed win, a comparison MC (right and wrong), the teach card, the re-queue, and switching grades.
