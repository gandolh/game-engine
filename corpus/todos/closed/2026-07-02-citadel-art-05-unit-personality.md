---
title: "Citadel art-05 — unit / character personality (villager roles, raider, crowd)"
created: 2026-07-02
status: done
tags: [citadel, client, render, art, units, characters, silhouette]
depends-on: [art-02]  # builds on the 4-value grey-ramp + 3-frame walk cycle already landed
scope: BRIEF-ONLY (no implementation yet — spec + acceptance)
---

# art-05 — Unit / character personality

## Why (code-grounded)

Units are also "similar and flat." From
[`units.ts`](../../games/citadel/client/src/render/sprites/recipes/units.ts):

- There is **ONE villager body** (`drawVillager`) reused for every job. Job identity is a
  **per-instance multiply-tint only** (job → hue in
  [`quads.ts`](../../games/citadel/client/src/render/quads.ts) VILLAGER_COLORS: farmer green,
  smith crimson, priest white, …). Silhouette is identical across all 10+ roles, so a farmer,
  a soldier, a priest and a trader are the *same figure in different colours*.
- The raider is one bulkier body; the pedestrian is one 16×16 crowd figure.
- Bodies are a clean 4-value grey ramp (good — keep the multiply-tint contract) but carry
  **no role silhouette cue** (no tool, hat, robe, pack) — so at a glance the town reads as
  uniform coloured pawns.

Per the references (SLYNYRD 54 character sections, and the "silhouette-first" rule in the
[style bible](../wiki/citadel-art-style.md)), a **held tool / headgear / robe** silhouette is
the cheapest, strongest way to make small figures read as distinct roles.

## Goal / acceptance

- **Role-silhouette read:** the top ~6 gameplay-visible roles are distinguishable **by
  silhouette in solid black** (before tint) via a small role-defining accessory — e.g. farmer
  = hoe/straw hat, smith = hammer/apron, priest = robe/hood, watchman/soldier = spear+helm,
  trader = pack/pouch, woodcutter = axe. Add a test: rasterize each role frame, assert the
  role accessory adds opaque pixels **outside the base villager mask** (so the silhouette
  actually changed), and that the change is in the expected region (e.g. a held-tool column).
- **Preserve the multiply-tint contract (do not break):** the body ramp stays NEUTRAL GREY
  (`#`→`S`→`s`→`l`→`v`); accessories that must take the job tint stay grey, accessories that
  must NOT (skin, a brown tool haft, a steel hammer head) use their own EDG chars off the
  tinted body — exactly the pattern the current warm skin-kiss uses. Re-assert the existing
  "body ramp is grey" guard.
- **Keep the 3-frame walk cycle** (`unitFrameAt`, render-clock, deterministic) — the accessory
  rides the pose offsets so it animates with the figure, no new RNG, no sim state.
- **Raider variety:** at least a 2nd raider silhouette (e.g. an archer vs the axe-bearer) so a
  warband isn't a clone army; gate behind raider `kind`/strength already in the snapshot if
  present, else deterministic by id.
- **Crowd:** keep the pedestrian cheap (single-frame 16×16) but add 2–3 silhouette variants
  (hat / basket / child) chosen deterministically by id so the ambient crowd isn't one repeated
  cutout. Respect the tight atlas/particle budget noted in the file.
- Palette guard green · typecheck green · determinism · **browser-verified** (playtest-citadel:
  a populated town at noon — roles legible at gameplay zoom).
- **Final grade:** passes the [asset critique rubric](../wiki/citadel-asset-critique.md) —
  this brief owns A4/A5 (unit role + crowd silhouettes) and the multiply-tint items.

## Work

1. **Role-accessory layer.** A small `drawRoleAccessory(g, role, pose)` in `units.ts` (or a
   sibling) that stamps the role's defining silhouette prop, riding the same `swayX/stepL/stepR`
   pose offsets. Data-drive from a `ROLE → accessory` table. New frame names
   `vil/<role>` (or `vil/person@<role>`) — keep them `@`-safe so they don't leak into any
   type set; cross-check every requested name has a recipe (the atlas throws otherwise — the
   art-02 review's #1 constraint).
2. **quads.ts wiring** — pick the role frame by the villager's job (the same field that today
   picks the tint), falling back to the base body when a role has no accessory yet. Keep tint.
3. **Raider + pedestrian variants** as above (deterministic by id).
4. **Head/skin & tool palette** — reuse the warm neutral kiss (`t` tan lit, `w`/`k` shaded)
   so faces/hands read warm without biasing the multiply.

## Constraints

- **The multiply-tint contract is load-bearing** — a stray non-grey pixel on the tinted body
  biases every instance of that job's colour. Test it.
- Figures stay **upright billboards** (small figures read fine on the iso grid — established).
- Deterministic; render-clock only; no `Math.random`/`Date.now` in the recipe.
- Atlas budget: role frames multiply the unit frame count — keep accessories tiny and only for
  roles that actually appear; the pedestrian stays single-frame.

## Out of scope

- Building silhouettes → **art-04**. Fire FX → **art-07**. Showcase page → **art-06**.
