# MateQuest M5 (slice 2 of 3) — RO/EN i18n toggle (the LAST slice → completes the milestone plan)

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-07-23
design-of-record: [../wiki/mathquest-overview.md](../../wiki/mathquest-overview.md) · tracker: [2026-07-21-mathquest-BUILD-STATE.md](../2026-07-21-mathquest-BUILD-STATE.md)

## Scope (this slice — the FINAL M5 slice; read the boundary carefully)

M5 slice 1 (folklore theming) and slice 3 (combat pixel-art sprites) are done. **This brief is slice 2:
full RO/EN internationalization + an in-game toggle**, the design's day-one "Bilingual RO / EN toggle,
centralized i18n" axis. Romanian stays the DEFAULT. After this, M5 (and the whole milestone plan) is
complete.

**In scope:** a `Locale = "ro" | "en"` seam; every user-facing string localized (client UI chrome AND
the sim-emitted content — problem prompts, teach cards, enemy names/epithets); an in-game toggle that
persists (localStorage) and switches the whole game. **Out of scope (defer, note them):** grades
V–VIII generators; "unlock new problem types" via mastery; any language beyond RO/EN; translating the
corpus/code comments.

## Constraints (carry into the work — same as every MateQuest slice)
- **Determinism load-bearing.** `locale` is a fixed INPUT (like `seed`/`mastery`), never affects an
  `Rng` draw — the same (seed, mastery, locale, commands) is identical, and RO vs EN changes only the
  WORDS, never which numbers/topics/nodes are generated. No `rng.fork` added/reordered; no
  `Math.random`/`Date.now`.
- **Answer non-leak invariant stays.** `answer`/`answerIndex` never cross the boundary.
- **Palette:** every colour via `MATE_PAL.*` (no raw hex). **No inline user-facing string literals** —
  everything localizable goes through the i18n seam (that's the whole point).
- **No `.js` suffixes; TS strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — omit
  optional keys, never assign `undefined`); pinned versions. Don't commit (controller integrates). No
  `git reset`/`checkout`/`stash`.
- Narrowest test scope while working (`-w @mathquest/sim-core`, `-w @mathquest/client`); **do NOT run
  determinism/EXPORT checks** (the controller asks the user) or the full repo suite.

## Architecture decision (LOCKED — implement this shape, don't invent another)

**The sim is locale-aware via an init option** (consistent with M4a's "sim emits display-ready text"
convention + how `init` already carries `seed` + `mastery`). It emits localized `prompt`/`teach`/enemy
`name`/`title` for the chosen locale. **Toggling the locale RE-INITS the sim** (fresh run in the new
language) — mastery is preserved because it is persisted (M4c) and re-loaded on the new `init`. This
keeps EVERYTHING consistent in one language at once (no mixed-locale snapshots) and needs no structural
change to `ProblemView` (prompts stay baked strings, just localized). A language change costing the
current run's POSITION (not progression) is acceptable for a settings-level toggle — note it in the UI.

Rationale to record: the alternative (sim emits locale-agnostic structured data, client renders text)
is cleaner long-term but a big refactor of every generator + `ProblemView` + teach helper; not worth it
for this slice. Sim-locale + re-init is the pragmatic, deterministic, low-risk choice.

## Current seams (already built — integrate with these, don't reshape)
- `client/src/strings.ts` — `STRINGS`, a single RO object: plain labels + formatter fns
  (`gradeReadout`, `playerResultCue`, `enemyResultCue`, `turnLabel`, `nodeLabel`, `legendLabel`,
  `bonusSummary`, `levelLabel`, `xpLabel`, `lifelineLabel`, `lifelineSummary`, `topicName`,
  `masteryLine`, `masteryHudLabel`, `runSummary`, `heroName`, zone/action/stat label maps, …). Every
  UI file imports `STRINGS` directly.
- `sim-core/src/combat/generators.ts` — RO `prompt`/`teach` text inline (e.g. `"Compară: {a} și {b}"`,
  `additionTeach`/`subtractionTeach`/`multiplicationTeach`/`comparisonTeach` prose). The `<`/`>`/`=`
  comparison choices are symbolic (locale-agnostic).
- `sim-core/src/run/enemies.ts` — `ROSTER` names + epithets (`title`), boss archetype, `enemyFor(kind,
  zone)`.
- `sim-core/src/sim-bootstrap.ts` — `bootstrapMathquestSim({seed, mastery?})`; `createCombat` is
  handed the per-node child rng + enemy; `MathquestSimOptions`; the `export type` re-export block.
- `sim-core/src/combat/combat.ts` — `createCombat(opts)`; `nextProblem` calls `GENERATORS[topic](rng,
  grade)`; builds the `EnemyView` in `snapshot()`.
- `client/src/worker/sim-worker.ts` — `init {seed, mastery}` (add `locale`).
- `client/src/main.ts` — owns localStorage (M4c pattern: `loadMastery`/`saveMastery`), posts `init`,
  builds the widget screens once, mode-aware render loop + keyboard handling.

## LOCKED mechanics (implement exactly)

### The locale type + storage
- `Locale = "ro" | "en"`; default `"ro"`. Define it in sim-core (`combat/types.ts` or a new
  `i18n.ts`) and re-export so both sides share it.
- localStorage key `"mathquest.locale.v1"`; a `parseLocale(raw: string | null): Locale` (pure,
  validate-or-default-to-"ro"), placed sim-side like `parseMasteryStore` so it's unit-tested; the
  client reads/writes it in `main.ts` (wrapped in try/catch, private-mode-safe — mirror M4c).

### Client UI strings (`client/src/strings.ts`)
- Refactor `STRINGS` into a **`Strings` interface** (the exact current shape) with **two
  implementations** `STRINGS_RO` and `STRINGS_EN`, selected by `getStrings(locale): Strings`. Keep RO
  values verbatim (RO is default). Translate EVERY entry to natural EN (labels + every formatter's
  output; e.g. `runWon` "Ai învins!"→"You won!", `actionLabel` Atacă/Vindecă/Scut→Attack/Heal/Shield,
  `lootSkip` "Sari peste"→"Skip", `masteryLine`/`runSummary`/etc.). A test asserts both bundles have
  identical keys (no missing translation).
- **Screens receive the resolved `Strings`.** The retained widget screens (combat/levelup/loot/
  run-over) currently import `STRINGS` directly and set some labels at BUILD time — so on a locale
  change they must be rebuilt (or re-bound). Simplest correct approach: `main.ts` holds `locale`, and
  on toggle **rebuilds the widget screens** with the new `Strings` (screens take `strings` at
  construction, or take `locale`); `map-screen` (custom-drawn) just reads the current `Strings` each
  frame (pass it into `render`). Pick ONE consistent approach and apply it everywhere; do not leave any
  screen reading a hardcoded `STRINGS`.

### Sim-emitted content (localized by locale)
- `MathquestSimOptions` gains `locale?: Locale` (default `"ro"`). Thread it to where text is produced:
  - **Generators** (`combat/generators.ts`): `GENERATORS[topic](rng, grade, locale)` — the teach
    helpers + the comparison prompt emit RO or EN. Keep the numeric/symbolic parts identical (only
    words differ: "Compară: {a} și {b}" ↔ "Compare: {a} and {b}"; "tabla înmulțirii" ↔ "times table";
    "apoi" ↔ "then"; etc.). `createCombat` gains `locale` in `CombatOpts` and passes it into
    `GENERATORS[...]`. Determinism: locale must NOT change the rng call sequence (draw the SAME
    numbers, then format) — assert this.
  - **Enemies** (`run/enemies.ts`): `enemyFor(kind, zone, locale)` returns localized `name`/`title`.
    **Folklore proper NAMES stay identical in both locales** (Zmeu, Balaur, Muma Pădurii, Strigoi,
    Vârcolac, Căpcăun, Zmeu bătrân — they are the theme, not translated); **epithets (`title`)
    translate** (e.g. "puiul balaurului" → "the dragon's whelp", "stăpânul bârlogului" → "lord of the
    lair"). `sim-bootstrap.ts`'s `chooseNode` passes the run's `locale` into `enemyFor`.
- Store `locale` in the driver's closed-over state (from `opts.locale ?? "ro"`); it never changes
  during a run (the toggle re-inits). It does NOT need to be on `RunView` unless a screen needs it —
  the client already knows its own locale.

### Worker + client wiring
- Worker `init` gains `locale`; forwards to `bootstrapMathquestSim({seed, mastery, locale})`.
- `main.ts`: `let locale = parseLocale(localStorage.getItem(LOCALE_KEY))`; post it in `init`; build
  screens with `getStrings(locale)`. **Toggle:** a keyboard shortcut **`L`** flips the locale in any
  mode; on toggle → persist the new locale → rebuild the widget screens with the new `Strings` → re-
  post `init {seed: SEED, mastery: <current>, locale}` (re-init = fresh run in the new language; the
  worker reloads mastery via the store the main thread hands it, OR main.ts passes the last-known
  mastery — keep mastery intact across the re-init). Also add a small **clickable** locale control if
  straightforward: a "RO | EN" indicator in the map HUD (drawn by `map-screen`) with a screen-space
  hit region in `main.ts` (main.ts already screen-space-hit-tests map nodes — add one more rect); if
  that proves fiddly, the `L` shortcut + a HUD indicator is the acceptable minimum. Combat/level-up/
  loot/run-over can also host a small toggle button (widget) — optional, nice for discoverability.
- Guard the `L` shortcut so it doesn't fire while typing an answer? Digits/Backspace/Enter feed the
  answer buffer; `L` isn't a digit, so it's safe — but ensure it doesn't get double-handled by the
  widget dispatcher (mirror the existing key-handling structure in `main.ts`).

## Tests (sim-core + client)
- **locale parse:** `parseLocale` returns "ro"/"en" for valid, "ro" for null/garbage/other.
- **strings parity:** `getStrings("ro")` and `getStrings("en")` expose the identical set of keys; a
  spot-check that a few EN values differ from RO and are non-empty.
- **generator localization:** the same (seed, grade) under "ro" vs "en" yields the SAME numeric answer
  and the SAME rng consumption (draw the operands identically), but locale-appropriate `prompt`/`teach`
  wording (e.g. EN comparison prompt contains "Compare"/"and", RO contains "Compară"/"și"). Assert the
  answer/answerIndex are locale-independent.
- **enemy localization:** `enemyFor(kind, zone, "en")` keeps the folklore NAME identical to "ro" but
  gives an EN `title`; stats still equal `ENEMY_ARCHETYPES[kind]` (balance still locked, both locales).
- **determinism guard:** (seed, mastery, locale, command script) reproduces identical snapshots;
  switching ONLY locale changes words, not structure (same map, same enemies-by-identity, same answers).
- **regression:** all existing tests pass — since RO is the default, any call without `locale` behaves
  exactly as today (RO). Update any test that hardcodes a bare RO literal to go through `getStrings`/the
  localized fn where appropriate, but keep RO assertions valid (default).

## Verify gate (controller runs, not the executor)
`npm run typecheck` (whole workspace) + `npm run test -w @mathquest/sim-core` + `-w @mathquest/client`
+ `@engine/core` palette test. Confirm `git status` touched only `games/mathquest/**` (+ this brief).
Grep clean of `Math.random`/`Date.now`/raw hex in new code, and of new inline user-facing string
literals outside the i18n bundles. Then the controller **plays it in the browser** (`npm run
mathquest`): default is RO; press `L` (or click the toggle) → the whole UI + a fight's prompt/teach +
enemy name-stays/epithet-translates flip to EN; reload → the chosen locale persists; toggle back to RO.
(Integration, not just green tests.)

## Not in scope (defer)
Grades V–VIII; mastery-unlocked new problem types; languages beyond RO/EN; a locale-agnostic
structured-`ProblemView` refactor (explicitly rejected above); translating word-problems (none exist
yet). After this slice, update the tracker: **M5 COMPLETE → the whole milestone plan (M0–M5) is done.**
