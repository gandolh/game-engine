# playtest-05 — UI/UX notes from the 2026-09-20 playtest (small, independent, none of them bugs)

> **CLOSED 2026-09-20 — all six items built, not just the cheap ones.** Tile ring slot 0 moved off
> `skyBlue` (which was both invisible on a `blue` button and the hover fill) to `hotPink`, pinned by a
> test that no ring may collide with any button-state fill. The loot / level-up / run-over cards are
> centred instead of pinned at a `(24,24)` inset. The map gained a pan hint — **and that turned up a
> real gap in the shared toolkit: the bitmap font baked `←` but not `→`**, so the first version of
> the hint rendered half-blank. U+2192 was in the vendored UNSCII all along and is now baked
> (one line per glyph table, the generator being deterministic). Hollow's founder form got a fixed
> label basis (aligned input column) and a **sticky** Start button — padding alone only made it
> reachable by scrolling, so Start is now visible on first paint and stays visible when a "Tune
> genes" panel expands (it used to be pushed 208px below a non-scrolling-looking fold).


status: CLOSED 2026-09-20 (see the note above; the original text below is unchanged) — a grab-bag of polish items; each is independently droppable
created: 2026-09-20
context: found while playing all four games in a browser. The four real defects are filed separately
as [playtest-01](2026-09-20-playtest-01-mathquest-keypad-below-the-fold.md) …
[playtest-04](2026-09-20-playtest-04-farm-home-screen-says-four-rivals.md). Everything here is
cosmetic or discoverability, and **each item is small enough to drop without discussion** — do not
treat this file as a batch that must be built whole.

## MateQuest

### 1. The quiz-tile identity cue only works on two of the three tiles

`TILE_COLORS = [MATE_PAL.skyBlue, MATE_PAL.gold, MATE_PAL.green]`
([combat-screen.ts](../../../games/mathquest/client/src/ui/combat-screen.ts)) paints a thick ring around
each choice tile — the deliberate "quiz-show A/B/C identity" cue. But the button fill is
`MATE_PAL.blue` (`#4d65b4`) and slot 0's ring is `skyBlue` (`#4d9be6`): two mid-blues, so **tile 1
reads as unframed** next to the clearly-ringed gold and green tiles. Observed on screen across
several problems.

Worse by construction: `skyBlue` is *also* the theme's button **hover** colour
([mate-theme.ts](../../../games/mathquest/client/src/render/mate-theme.ts)), so hovering tile 1 makes
fill and ring the same colour and the frame disappears entirely; hovering tile 2 or 3 turns it the
same blue as tile 1's ring, muddling the cue further. (Derived from the palette values, not observed
— the sandbox cannot drive canvas hover reliably.)

Fix: give slot 0 a ring colour that is not in the button-state palette — a warm one (`crimson` is
taken by the 50-50 "eliminated" overlay, so something like orange/violet from `MATE_PAL`) — and
check all three against both `normal` and `hover` fills.

### 2. Loot / level-up / run-over render as a small card in the corner of an empty screen

On a 1280×577 viewport the loot screen occupies roughly `(24,24)–(659,246)`; the remaining ~75% is
flat background. Combat and the map both fill the viewport, so these three screens read as
unfinished by comparison.

This is **deliberate** — [main.ts](../../../games/mathquest/client/src/main.ts) comments it: *"Combat
lays out FULL-VIEWPORT …; the other widget screens keep the plain top-left inset"*
(`computeLayout(root, 24, 24, MATE_THEME)` with no size opts). So this is a design call to revisit,
not a defect. Centring them, or giving them a full-viewport backdrop with the card centred, would
make the run feel of one piece. Cheap: pass viewport opts and centre, same as combat.

### 3. The map extends past the viewport with nothing saying so

The journey map is wider than the screen and pans with the arrow keys
(`KEY_PAN_STEP = 90`); panning right reveals `Munții Carpați`, `Bârlogul Zmeului` and the boss node.
Nothing on screen indicates either that there is more map or that arrows pan it — the legend strip
along the bottom has room for a hint, and the a11y map mirror already announces its keys
("tastele 1-2") while the visual UI announces nothing. An edge arrow, or one line in the legend, is
enough. (The reachable-node choices are always on screen, so this is discoverability, not a blocker.)

## Hollow

### 4. The Start button is clipped by ~14px on first load

At 577px height the founder form's `Start` sits at `y=555..591` — its bottom 14px are cut. It is
still clickable, and `.hollow-setup-panel` scrolls (`scrollHeight 845 > clientHeight 577`), so
**this is not a blocker**: scrolling brings it fully into view, and expanding a "Tune genes" panel
(which pushes Start to `y=785`) is likewise recoverable by scrolling.

But the first thing a new player sees is a half-cut primary button with no visible scrollbar cue.
Either a sticky footer holding `Start` (and `Randomize`), or `padding-bottom` on the panel so the
button is never the clipped element, would fix it.

### 5. The founder form's input column is not aligned

Labels and inputs are laid out inline, so the input column starts wherever the longest label ends:
`food nodes` puts its field at `x=173`, `material regen/tick` at `x=181`, and the resource-density
fields step raggedly. A two-column grid (or a fixed label width) lines them up. Purely cosmetic.

## Ruled out — checked during the playtest and **not** problems

Recorded so nobody re-files them:

- **A "stray artifact" beside MateQuest's enemy HP panel** — magnified 8×: it is a **cloud sprite
  passing behind the panel**, correctly occluded. Not a rendering bug.
- **MateQuest's combat a11y mirror looked like it was missing the problem text** — it is not. The
  prompt, topic and turn are carried as `aria-label`s (`aria-label="Compară: 10 și 7"`,
  `"Comparare"`, `"Tura 2"`), which `textContent` does not show. The mirror is sound, its buttons are
  live (clicking them drives the game), and its DOM order matches the on-screen shuffle order.
- **Citadel's grey `Stone` / `Tools` chips** — deliberate per-material colours (`stone: EDG.steel`,
  `tools: EDG.silver`), not a disabled/zero state. (Their *clipping* is real — see playtest-02.)
- **Citadel rejecting a building placement silently** — the click landed on occupied tiles. Placement
  on valid ground works: a house cost 4 wood, raised `popCap` 6→12 and drew an immigrant within a day.
- **Hollow's chronicle repeating one line five times** ("Y1 Moxford helps Wrenwyn") — a transient
  early-game cluster. By Y5 the feed was fully varied. No dedup problem.
- **Hollow's clipped metric charts** — `.hollow-dashboard-panel` and `.hollow-chronicle-list` both
  scroll. Working as intended.
- **Farm's "missing" Pip** — Pip renders and `Space` recentres the camera on them correctly; the
  first look was a mis-read crop of the screenshot.
- **Low frame rates in all four games** (10–35 fps) — software rendering in this sandbox, not a
  measurement of the games. Not a finding; see
  [performance-measurements.md](../../wiki/performance-measurements.md) for how perf numbers should be
  taken here.
