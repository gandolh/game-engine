# audit-62 — Three games re-derive the day fraction, and two define the day/night curve with opposite polarity

status: todo
created: 2026-09-18
context: found by the debt lens of the 2026-09-18 sweep. Small, but the failure mode is a bug that
looks correct in both branches.

## The gap

The same four-line modulo-and-divide exists three times:

```ts
// games/farm/sim-core/src/systems/day-phase.ts:9-12
export function dayFraction(tick, ticksPerDay) { const into = ((tick % ticksPerDay) + ticksPerDay) % ticksPerDay; return into / ticksPerDay; }
// games/citadel/client/src/render/atmosphere.ts:40-56
export function dayFractionOf(tick, ticksPerDay) { if (ticksPerDay <= 0) return 0; … }
// games/hollow/client/src/render3d/day-night.ts:38-58
export function dayNightPhase(tick, ticksPerDay) { if (ticksPerDay <= 0) return 0; … }
```

Only two of the three guard `ticksPerDay <= 0`; Farm's divides by zero and returns `NaN`.

Then the curves **invert**:

```ts
// citadel/…/atmosphere.ts:53  nightFactorOf  → 1 at midnight
const f = (1 + Math.cos(2 * Math.PI * dayFraction)) / 2;
// hollow/…/day-night.ts:54    dayNightFromPhase → 0 at midnight
const dayNight = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
```

Same input, same shape, **opposite meaning**, under names that do not make the difference obvious.

## The cost

MateQuest and Hollow both explicitly copy Citadel's render idioms (see
[audit-61](2026-09-18-audit-61-noise-stack-duplicated-four-ways.md), where the copying is documented in
comments). Anyone moving lighting code between games has even odds of picking the wrong polarity and
producing a world that is brightest at midnight — which reads as a plausible wash in a screenshot and
is exactly the kind of bug that ships. A fourth game means a fourth copy and a fourth coin flip.

## What to do

Put `dayFraction` and a **named, unambiguous** pair in `@engine/core` — both pure, both generic. The
naming is the actual deliverable: `nightFactor` and `daylightFactor` as an explicit complementary pair
(`daylightFactor = 1 - nightFactor`), documented with what each equals at midnight and noon, so a call
site cannot silently mean the other one.

Guard `ticksPerDay <= 0` once, in the shared version.

Then adopt in all three. Check each call site's *use* rather than trusting the name — the point is to
find out whether any of the three is already wrong, which this sweep did not determine.

## Files you OWN
- a new module in `engine/core/src/` (or an addition to an existing generic one)
- [`games/farm/sim-core/src/systems/day-phase.ts`](../../games/farm/sim-core/src/systems/day-phase.ts)
- [`games/citadel/client/src/render/atmosphere.ts`](../../games/citadel/client/src/render/atmosphere.ts)
- [`games/hollow/client/src/render3d/day-night.ts`](../../games/hollow/client/src/render3d/day-night.ts)

## Files you must NOT touch
- each game's wash **colours** and season tables — locked per-game palettes; extract the curve, not
  the look
- Farm's `dayFraction` is in **sim-core** and feeds sim behaviour (day phases), not just rendering.
  Changing it changes the sim: it must be a provable no-op, or it is a different brief.

## Acceptance
- One definition of the day fraction and one named polarity pair; the three copies import them.
- A test pinning the values at phase 0, 0.25, 0.5, 0.75 for both `nightFactor` and `daylightFactor`,
  and that they sum to 1.
- `ticksPerDay = 0` returns a defined value in all three games (Farm's `NaN` is fixed).
- **Byte-identical sim output** for Farm — if it moves, Farm's missing zero-guard was reachable and
  that is the real finding.
- Citadel's and Hollow's washes are visually unchanged; browser-verify both, since a polarity flip is
  invisible to a unit test that was written against the wrong sign.
