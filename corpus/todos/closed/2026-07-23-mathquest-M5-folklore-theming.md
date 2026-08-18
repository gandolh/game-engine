# MateQuest M5 (slice 1 of 3) — Romanian-folklore theming (zone-flavored enemy roster + hero)

status: TODO (dispatch to a Sonnet executor; controller = opus verifies)
created: 2026-07-23
design-of-record: [../wiki/mathquest-overview.md](../../wiki/mathquest-overview.md) · tracker: [2026-07-21-mathquest-BUILD-STATE.md](../2026-07-21-mathquest-BUILD-STATE.md)

## Scope (this slice only — M5's FIRST of three; read the boundary carefully)

M4 is complete. **M5 (theme, art, i18n)** is the last milestone; it splits into three slices. The user
picked **folklore theming FIRST.** This brief is that slice only:
- **THIS (folklore theming):** a real Romanian-folklore enemy roster that varies by the map's four
  zones (forest / village / mountains / lair), each enemy with an RO epithet; the playable hero named
  in-theme (Făt-Frumos). All flavor/content — **balance stays byte-identical** (only NAMES/epithets
  change; hp/intent/grade untouched). Deterministic, unit-tested.
- **M5 i18n (NOT now):** `strings.ts` → locale-aware RO/EN toggle. These new RO enemy names/epithets
  live in `run/enemies.ts` as sim-side content (like generator `prompt`/`teach` text) — when i18n lands
  they become bilingual there; do NOT build the toggle here.
- **M5 art (NOT now):** authored pixel-art sprites. This slice is names/flavor only; no render seam.

## Constraints (carry into the work — same as every MateQuest slice)
- **Determinism load-bearing.** No new randomness — enemy name/epithet are PURE functions of the node's
  zone + kind. No `rng.fork` added, none reordered; no `Math.random`/`Date.now`. Zone is a deterministic
  function of the node's `row` (see below), so the same seed → same roster.
- **Balance is LOCKED.** `ENEMY_ARCHETYPES`'s hp/intentBase/intentRoll and `BOSS_GRADE` do NOT change
  — the winnability tests (`sim-bootstrap.test.ts`'s "beating the boss" / 300-seed search) depend on
  them. Theming varies ONLY the display `name` (and adds an epithet); a themed archetype must carry the
  exact same stats as today's `ENEMY_ARCHETYPES[kind]`.
- **Palette:** every colour via `MATE_PAL.*` (no raw hex). **RO by default** — enemy names/epithets are
  RO literals in `run/enemies.ts` (sim-side content, allowed); any CLIENT chrome/labels go in
  `client/src/strings.ts` (RO).
- **No `.js` suffixes; TS strict** (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — omit
  optional keys, never assign `undefined`); pinned versions. Don't commit (controller integrates). No
  `git reset`/`checkout`/`stash`.
- Narrowest test scope while working (`-w @mathquest/sim-core`, `-w @mathquest/client`); **do NOT run
  determinism/EXPORT checks** (the controller asks the user) or the full repo suite.

## Current seams (already built — integrate with these, don't reshape)
- `sim-core/src/run/enemies.ts` — `EnemyKind = "combat"|"elite"|"boss"`, `EnemyArchetype {name, maxHp,
  intentBase, intentRoll}`, `ENEMY_ARCHETYPES: Record<EnemyKind, EnemyArchetype>` (combat "Zmeu pui"
  24/5-8, elite "Balaur" 26/5-7, boss "Zmeu bătrân" 32/5-7), `BOSS_GRADE = 4`. TODAY every combat node
  is the same "Zmeu pui" regardless of zone — that's the gap this slice closes.
- `sim-core/src/run/map.ts` — `MapNode {id, type, row, col, grade, next}`; `generateMap(rng, opts?)`;
  6 rows (`ROW_COUNT`) + a boss row at `row === ROW_COUNT`. **No zone concept in the sim yet** — zones
  are currently CLIENT-only.
- `client/src/ui/map-screen.ts` — derives 4 visual zones from the horizontal journey COLUMN-wise:
  `colsPerZone = ceil((colCount-1)/3)`, `zoneOfCol(i) = i >= bossColIndex ? 3 : min(2, floor(i/colsPerZone))`.
  For the current 6 rows + boss (7 "columns", `colsPerZone === 2`) this is exactly: rows 0-1 → zone 0
  (forest / Pădurea Adâncă), rows 2-3 → zone 1 (village / Satul), rows 4-5 → zone 2 (mountains / Munții
  Carpați), boss row → zone 3 (lair / Bârlogul Zmeului). `ZONE_THEMES`/`ZoneKind` there are the visual
  palettes. **The sim's new `zoneForRow` MUST reproduce this exact split** so the enemy you fight matches
  the zone you're visually standing in.
- `sim-core/src/sim-bootstrap.ts` — `chooseNode` builds a fight via `enemy: ENEMY_ARCHETYPES[node.type]`
  — the ONE call site to switch to the zone-aware selector.
- `client/src/ui/combat-screen.ts` — `warriorNameLbl = label("Warrior", …)` (a hardcoded EN literal to
  fix); `enemyNameLbl` shows `snapshot.enemy.name`. `EnemyView` (`combat/types.ts`) is what crosses the
  boundary.

## LOCKED mechanics (implement exactly — controller-decided so it's deterministic + testable)

### Zone as a sim concept (`run/map.ts`)
- Add `export type Zone = 0 | 1 | 2 | 3;` and `export function zoneForRow(row: number): Zone` =
  `row < 2 ? 0 : row < 4 ? 1 : row < 6 ? 2 : 3` (reproduces the client's rows→thirds+boss split for
  `ROW_COUNT = 6`; a colocated comment must pin it to `map-screen.ts`'s `zoneOfCol`, and a test asserts
  the two agree for rows 0..ROW_COUNT).
- `MapNode` gains `readonly zone: Zone;` — set in `generateMap` from `zoneForRow(row)` for every node
  (the boss node at `row === ROW_COUNT` → zone 3). Additive field; the DAG/edge logic is untouched.

### Zone-flavored enemy roster (`run/enemies.ts`)
- Keep `ENEMY_ARCHETYPES` (the STATS, keyed by `EnemyKind`) exactly as-is — it stays the single source
  of hp/intent. Add a name+epithet table keyed by `(EnemyKind, Zone)` and a selector that composes them:
  ```ts
  export function enemyFor(kind: EnemyKind, zone: Zone): EnemyArchetype
  ```
  returning `{ ...ENEMY_ARCHETYPES[kind], name, title }` where `name`/`title` come from the table below.
  The boss ignores zone (there is one boss, always in the lair). The function must be TOTAL over all 4
  zones (define z3 combat/elite too, even though the current row-split never places a non-boss node in
  zone 3 — future-proof + keeps the function total).
- `EnemyArchetype` gains `readonly title: string;` (a short RO epithet). Add it to today's three
  `ENEMY_ARCHETYPES` entries too (so the type stays satisfied) OR keep `ENEMY_ARCHETYPES` as stats-only
  and attach `name`/`title` solely in `enemyFor` — your call, but `enemyFor`'s return MUST include both.
- **Roster (RO folklore — LOCKED names; epithets may be lightly adjusted for grammar, keep them short
  & RO):**
  | kind | zone 0 forest | zone 1 village | zone 2 mountains | zone 3 lair |
  |---|---|---|---|---|
  | combat | **Zmeu pui** — "puiul balaurului" | **Strigoi** — "mortul viu" | **Căpcăun** — "uriașul munților" | **Slugă de Zmeu** — "sluga stăpânului" |
  | elite | **Muma Pădurii** — "vrăjitoarea codrului" | **Vârcolac** — "fiara lunii" | **Balaur** — "balaurul cu multe capete" | **Zmeu** — "zmeul din bârlog" |
  | boss (any zone) | **Zmeu bătrân** — "stăpânul bârlogului" | | | |
  All folklore-authentic; all stats come from `ENEMY_ARCHETYPES[kind]` (so combat everywhere is 24/5-8,
  elite everywhere 26/5-7, boss 32/5-7 — winnability unchanged).

### Wire the selector (`sim-bootstrap.ts`)
- `chooseNode`: replace `enemy: ENEMY_ARCHETYPES[node.type]` with `enemy: enemyFor(node.type, node.zone)`.
  (`node.type` is `combat|elite|boss` at any fight node — `rest` never reaches here; the existing guard
  stands.) No other driver change; no snapshot-shape change beyond the enemy `title` below.

### Surface the epithet (`combat/types.ts` + `combat/combat.ts` + client)
- `EnemyView` gains `readonly title: string;` — `combat.ts`'s `snapshot()` copies it from the
  archetype (the archetype now carries `title`). This is display text, not a secret — no non-leak
  concern.
- `client/src/ui/combat-screen.ts`: (a) fix the hardcoded warrior label — `warriorNameLbl` text comes
  from a new `STRINGS.heroName` (RO "Făt-Frumos", the classic Făt-Frumos hero of the design); (b) show
  the enemy epithet as a small line under the enemy name (`enemyTitleLbl`, a muted `MATE_PAL.steel`
  label bound from `snapshot.enemy.title`, build-once + rebound per refresh like the other labels).
- `client/src/strings.ts`: add `heroName: "Făt-Frumos"`. (The map HUD's existing "Războinic" role word
  may stay as-is — it's the class/role label next to the HP bar, not the hero's proper name — or be
  switched to `heroName`; keep it RO either way.)

## Tests (sim-core; extend `run/map.test.ts` + `run/enemies.test.ts` (new if absent) + `sim-bootstrap.test.ts` + client)
- **zoneForRow:** returns 0/0/1/1/2/2 for rows 0..5 and 3 for the boss row (`ROW_COUNT`); a test that
  pins it to the client's rows→thirds+boss intent (assert the mapping explicitly).
- **map carries zone:** every node's `zone === zoneForRow(node.row)`; the boss node is zone 3; adding
  `zone` didn't disturb the DAG invariants (reuse the existing connectivity helper).
- **enemyFor:** for every `(kind, zone)` the returned stats EQUAL `ENEMY_ARCHETYPES[kind]` (hp/intent
  identical — the balance-preservation guarantee, asserted exhaustively), and `name`/`title` match the
  roster table; the boss name is "Zmeu bătrân" for every zone.
- **driver theming:** a combat node in a forest row fights the forest combat name; an elite node fights
  its zone's elite name; the boss fights "Zmeu bătrân". (Update `sim-bootstrap.test.ts`'s existing
  elite-name assertion — currently `expect(...enemy.name).toBe("Balaur")` — to derive the expected name
  from the chosen elite node's ZONE via the roster, not a bare literal. Do NOT weaken it to
  `toBeTruthy()`; assert the exact zone-correct name.)
- **regression:** the winnability / "beating the boss" tests still pass UNCHANGED (stats identical);
  any `toEqual` on a full `MapNode` gets `zone` added to its expected object (or switch to
  `toMatchObject`); the combat epithet is present in the snapshot.
- **client:** combat screen shows `STRINGS.heroName` (not "Warrior") and renders the enemy title line.

## Verify gate (controller runs, not the executor)
`npm run typecheck` (whole workspace) + `npm run test -w @mathquest/sim-core` + `-w @mathquest/client`
+ `@engine/core` palette test. Confirm `git status` touched only `games/mathquest/**` (+ this brief).
Grep clean of `Math.random`/`Date.now`/raw hex in new code. Then the controller **plays it in the
browser** (`npm run mathquest`): fight nodes across different zones and confirm the enemy NAME + epithet
match the zone (forest → Zmeu pui/Muma Pădurii, village → Strigoi/Vârcolac, mountains → Căpcăun/Balaur),
the boss is "Zmeu bătrân", and the hero reads "Făt-Frumos". (Integration, not just green tests.)

## Not in scope (defer to the other M5 slices)
The RO/EN i18n toggle; authored pixel-art sprites; per-enemy unique STATS or abilities (balance is
locked); boss variety (one boss per run today); companion Archer/Mage naming (not implemented yet);
grades V–VIII. A map-node hover showing the enemy name is a nice-to-have — skip unless trivial.
