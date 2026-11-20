# Task 14: MateQuest's combat sprites as pixel art

**Origin:** MateQuest's design page: "commission pixel art via the atlas-recipe pipeline once the
fun is confirmed". The game has been playable since 2026-07-23. The plan is
[frame-budget.md](../../wiki/frame-budget.md).

**Builder:** opus (pixel art, [routing.md](../../routing.md)).

**Depends on:** brief 12 (the creatures are recipes on an atlas) and brief 13 (which method draws
them).

## Context

After brief 12, the seven combat creatures are recipes ported from placeholder rectangles: blocky,
flat and unshaded. This brief redraws them as real pixel art with the method brief 13's trial chose:
`pixel-draw` drafts that the owner runs and an agent touches up, or recipes an agent writes directly.

The craft rules this repo already applies to Farm hold here too
([asset-pipeline.md](../../wiki/asset-pipeline.md), "Art direction"):

- a silhouette you can read in solid black;
- light from the top-left;
- hue-shifted shading ramps;
- selective outlines;
- small clusters, not single-pixel noise.

## Files you OWN

- `games/mathquest/atlas-recipes/` (the seven creature recipes and the allowlist)
- `games/mathquest/client/public/atlas/` (cooked output)
- `corpus/verify/<date>-mathquest-creatures/` (screenshots), and `corpus/` pages for this brief: the
  outcome, `log.md`, [mathquest-ui.md](../../wiki/mathquest-ui.md)

## Files you must NOT touch

- `games/mathquest/sim-core`, and the client's drawing code beyond a frame's size or anchor if a new
  drawing needs it.

## What to do

1. **Redraw the seven creatures** at 32 or 48 px, keeping each one's ground line and facing: the
   hero faces right, the enemies face left. Use the shared `MATE_PAL` colours with at least three
   shades per material. Each creature should read from its folklore. If the trial chose `pixel-draw`,
   give the owner the commands for the drafts in one batch, as in brief 13, then import and touch up.
2. **Check them** with brief 11's checks and the palette guard. Allowlist nothing new without a
   reason.
3. **Screenshots.** Take the combat screen with each enemy at 1280×800, plus a phone-sized
   390×844 view, under `corpus/verify/`.

## Acceptance

- Seven recipes pass the checks and the palette guard, and the atlas cooks.
- The verify folder holds the before and after screenshots for every enemy, at both sizes.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- If the trial chose `pixel-draw`, the batch of drafts first.
- Look at the screenshots and say which creatures need another pass.
- Deploy: `node cli.ts mathquest deploy` from the vps-deploy checkout.
