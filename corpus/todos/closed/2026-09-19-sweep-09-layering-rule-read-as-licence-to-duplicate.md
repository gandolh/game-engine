# sweep-09 — "games never import each other" was read as a licence to duplicate, and `panel-prefs.ts` has already diverged

status: todo
created: 2026-09-19
context: found by a read-only structure/performance/compatibility sweep on 2026-09-19. Stronger than
[sweep-02](2026-09-19-sweep-02-apollo-palette-five-copies.md)'s palette case in one specific way: those
five copies were verified byte-identical, so that brief had to argue from *risk*. **These two have
already drifted, and one of them lost a capability.**

## The gap

[`games/citadel/client/src/main/panel-prefs.ts`](../../../games/citadel/client/src/main/panel-prefs.ts)
explains itself, accurately, in its own header:

> *Citadel panel-preferences store — a tiny persistence helper for collapsible in-canvas HUD panels,
> mirroring Farm Valley's `ui/canvas/panel-prefs.ts` (brief 117) **one-for-one**. Citadel never imports
> Farm code (games never import each other — see CLAUDE.md), so this is a **from-scratch port** under
> its own storage key, not a shared module.*

Every clause of that is true. The conclusion is the problem: **the layering rule forbids Citadel
importing Farm; it does not forbid both importing `@engine/ui`** — which both clients already depend on.
The rule ruled out one option and the author read it as ruling out the shared module too.

### What the two copies are

| | Farm | Citadel |
|---|---|---|
| path | [`client/src/ui/canvas/panel-prefs.ts`](../../../games/farm/client/src/ui/canvas/panel-prefs.ts) | [`client/src/main/panel-prefs.ts`](../../../games/citadel/client/src/main/panel-prefs.ts) |
| lines | 91 | 101 |
| API | `isOpen` / `setOpen` / `toggle` | identical |
| storage key | `farm.ui.panels.v1` | `citadel.ui.panels.v1` |
| `Storage` hardening | try/catch on read **and** write; once a throw is seen, fall back to an in-memory map for the instance's life and never retry | identical, word for word in the doc too |
| per-id defaults | **absent** — `isOpen` is `load()[id] === true`, so a panel *cannot* default open | `PANEL_DEFAULTS` — `stored === undefined ? PANEL_DEFAULTS[id] : stored` |

A `diff` of the two is almost entirely the doc comment, the `PanelId` union and the storage key. The
only behavioural difference is the last row — and it is not a tie. **Citadel's copy is strictly better
and Farm's is strictly poorer**: Farm's five panels all default closed *because its implementation
cannot express anything else*, not because that was chosen. The improvement was made on the copy and
never travelled back, which is the whole failure mode of duplication, observed rather than predicted.

### The same idiom, a third and fourth time

`safeLocalStorage()` — resolve `window.localStorage`, swallow the throw, return `Storage | null` —
exists twice more:

| file | note |
|---|---|
| [`games/farm/client/src/main/panels.ts`](../../../games/farm/client/src/main/panels.ts) (~97) | the original |
| [`games/citadel/client/src/main/hud-panels.ts`](../../../games/citadel/client/src/main/hud-panels.ts) (~59) | its own comment cites *"Farm Valley's `main/panels.ts::safeLocalStorage`"* |

And MateQuest hand-rolls the same try/catch four more times inline — `loadMastery` / `saveMastery` /
`loadLocale` / `saveLocale` in [`main.ts`](../../../games/mathquest/client/src/main.ts) (~96–134) — each
with its own correct-but-separate comment about private mode and quota. **Four games, four
implementations of "reading `localStorage` can throw."** All four are correct today. None is shared.

## Why it is worth fixing

1. **It already cost something.** Farm cannot express a default-open panel. Not hypothetically — the
   code path does not exist there.
2. **It is genuinely game-agnostic.** A try/catch-hardened, `Storage`-backed, keyed-boolean store
   parameterised by key, id set and per-id defaults contains **no** game concept. The only game-specific
   parts are exactly the three values already passed in or declared per copy.
3. **`@engine/ui` is the correct home and is already a dependency of both clients.** It owns the
   collapsible-panel widgets whose state this persists — the prefs store is the missing half of a
   feature the toolkit already provides.
4. **The misreading will recur.** Fifteen sites across Citadel's client cite Farm as the source they
   reimplemented (`debug-overlay-wiring.ts`, `render-loop.ts`'s size-key sentinel, `status-panel.ts`,
   `entity-interp.ts`, `screen-mapping.ts`, `server-client.ts`, `sim-host.ts`, …). Most of those are
   genuinely game-specific and should stay duplicated. But the rule that decides which is which has
   never been written down, so each author re-derives it and some get it wrong.

## What to do

1. **Promote the prefs store to `@engine/ui`.** Something like
   `createPanelPrefs<Id extends string>({ storageKey, ids, defaults, storage })`. Generic over the id
   union so each game keeps its own `PanelId` type and its own key. Both games import it; both local
   copies are deleted.
2. **Farm gains per-id defaults for free** — that is the point of consolidating on the better copy
   rather than the older one. **Do not change any Farm panel's actual default in this brief.** All five
   stay closed; the capability arrives unused. Changing a default is a UX call, separately.
3. **Promote `safeLocalStorage` with it**, as the storage-resolution half of the same concern. Both
   copies go; MateQuest's four inline try/catches can then be four calls, which is the honest measure of
   whether the abstraction is right.
4. **Write down the rule that decides duplicate-vs-promote**, as one entry in
   [decisions.md](../../wiki/decisions.md). Proposed wording to argue with:

   > *"Games never import each other" forbids a game→game edge. It does **not** mean a shared concern
   > must be duplicated. If a helper contains no concept from any game — only types and values its
   > caller supplies — it belongs in `@engine/core` or `@engine/ui`, and both games import it. If it
   > encodes a game's rules, geometry, balance or vocabulary, duplicate it and say so in the header.*

   This is the durable output of the brief. The two-file dedupe is small; the rule is what stops the
   next fifteen.
5. **Explicitly leave the rest alone.** `entity-interp.ts`, `screen-mapping.ts`, `pacing.ts`,
   `sim-host.ts`, the sprite `types.ts` — each encodes something about its game (iso projection, tick
   pacing, Citadel's `PixelRecipe` shape). They stay duplicated. **Applying the new rule across all
   fifteen is not this brief**; if step 4's wording makes another one obviously wrong, file it
   separately with its own evidence.

## Already handled, do not re-derive
- The tick pump was this exact pattern and was **already fixed**: Citadel and Hollow had drifted onto two
  meanings of "speed" and both now share `createTickPump`
  ([decisions.md](../../wiki/decisions.md) → Tick pump, audit-26). That is the precedent this brief follows,
  and it is worth citing in the `decisions.md` entry as the case that proves the rule.
- Cross-game export-name duplication was scanned: **no** exported name is shared by three or more games,
  and only 18 are shared by exactly two. Of those, the Apollo trio is
  [sweep-02](2026-09-19-sweep-02-apollo-palette-five-copies.md)'s, `screenToWorld` is recorded there as
  *not worth promoting*, and the rest (`bootstrapSim`, `WORLD_WIDTH`, `getSnapshot`, `isWalkable`,
  `personalityRegistry`) are same-name-different-thing — the collision hazard
  [code-graph.md](../../wiki/code-graph.md) already documents. `createPanelPrefs` and `createInspectPanel`
  are the two real ones; this brief takes the first.

## Files you OWN
- `engine/ui/src/` — a new module (and its barrel entry) for the prefs store + storage resolver
- `games/farm/client/src/ui/canvas/panel-prefs.ts` and `games/farm/client/src/main/panels.ts` (delete /
  rewire)
- `games/citadel/client/src/main/panel-prefs.ts` and `.../main/hud-panels.ts` (delete / rewire)
- `games/mathquest/client/src/main.ts` (the four try/catches, only if step 3 makes it clean)
- `corpus/wiki/decisions.md` (one entry)

## Files you must NOT touch
- Any panel's **default open/closed state**, in either game. This is a move, not a UX change. Citadel's
  `status` panel stays open; Farm's five stay closed.
- Either storage **key**. `farm.ui.panels.v1` and `citadel.ui.panels.v1` must survive verbatim or every
  existing player silently loses their layout.
- `@mathquest/sim-core`. Verified during the sweep: all 31 `localStorage` matches under `games/*/sim-core/`
  are **comments**, several of them explaining why the module must never touch it. That architecture is
  correct and this brief must not put a storage helper anywhere a sim-core can import it.

## Acceptance
- One implementation. `grep -rn "localStorage" games --include=*.ts` shows no production access outside
  the promoted helper.
- **Both keys round-trip.** Seed `farm.ui.panels.v1` and `citadel.ui.panels.v1` with a pre-change blob and
  confirm each game restores the same layout after. This is the regression that would silently annoy every
  returning player.
- **The hardening still works**: a `Storage` stub that throws on `getItem`, and one that throws on
  `setItem`, and the store keeps functioning in memory for the rest of its life without retrying —
  which is what both current copies promise in their docs.
- Farm can now express a default-open panel (prove it in a test), while no Farm panel's shipped default
  changed.
- `@engine/ui` stays Node-importable — see [decisions.md](../../wiki/decisions.md) → *The engine's public
  barrels must stay Node-importable*. A new barrel export touching `Storage`/`window` must be guarded the
  way the rest of the engine guards `typeof window`, and `npm run gates`' startup smokes are the check.
- `npm run test -w @engine/ui` + both clients' suites + `npm run gates`.
