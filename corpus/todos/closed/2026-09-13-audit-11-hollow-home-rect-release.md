# audit-11 — Hollow never releases home footprints, so placement degrades without bound

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Hollow is the *generational* sim — this grows worse the longer it runs, which is its intended use.

## The defect

[games/hollow/client/src/render3d/app.ts](../../../games/hollow/client/src/render3d/app.ts):
`placedHomeRects` is declared at line 291 and only ever **pushed** (line 469) — never spliced, filtered
or cleared. A dissolved household's footprint is reserved forever.

```ts
pos = findFreePlacement(freshPos, w, d, HOME_MARGIN, placedHomeRects);
homePosByHousehold.set(householdId, pos);
placedHomeRects.push(footprintRect(pos.x, pos.y, w, d, HOME_MARGIN));
```

The search is [home-placement.ts:69-91](../../../games/hollow/client/src/render3d/home-placement.ts#L69-L91)
— a spiral of up to 48 rings, `ring * 8` samples each, every sample scanning the whole (still-growing)
`placed` array.

## Failure scenario

Households form and dissolve continuously across generations. `MAX_HOME_FOOTPRINT` + `HOME_MARGIN = 0.8`
reserves roughly 4.6×4.6 tiles each, so ~190 reservations saturate the 64×64 map. After about that many
household formations, `isFree` fails everywhere and the spiral runs all 48 rings:
`Σ(ring*8) for ring 1..48 = 9,408` samples, each a full scan of an ever-growing array — on the order of
**1.8 M `rectsOverlap` calls in a single frame**, i.e. a visible multi-hundred-millisecond hitch. It then
recurs for every household born after that, getting worse each time. `homePosByHousehold` leaks in
parallel.

## Fix sketch

1. **Release on dissolve** — when a household id disappears from the snapshot, drop its rect and its
   `homePosByHousehold` entry.
2. **Index instead of scanning** — bucket `placed` into a coarse tile grid so `isFree` tests only
   neighbours.
3. **Fail fast** — cap `maxRings` to the grid's real extent so an impossible search ends immediately
   instead of running 48 rings.

## Files you OWN
- [games/hollow/client/src/render3d/app.ts](../../../games/hollow/client/src/render3d/app.ts)
- [games/hollow/client/src/render3d/home-placement.ts](../../../games/hollow/client/src/render3d/home-placement.ts) + its tests

## Files you must NOT touch
- `games/hollow/sim-core/**` — home *placement* is render-side dressing; it must not start feeding the sim

## Acceptance
- `placedHomeRects.length` tracks the number of *live* households, not cumulative formations. Show it
  stabilising over a long fast-forwarded run.
- Home positions stay **stable** for a household across its lifetime (households must not teleport when
  a neighbour dissolves) — assert this; it is the easy thing to break here.
- A long run (fast-forward past saturation) shows no frame hitch on household formation. Report the
  before/after worst-frame time.
- `npm run test -w @hollow/client` green.
