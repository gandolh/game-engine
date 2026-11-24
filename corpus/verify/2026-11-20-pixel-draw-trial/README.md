# The pixel-draw trial (brief 13)

**Owner: until both picks are in, open only [blind-sheet.md](blind-sheet.md).** Everything else in this folder
names the methods.

This is a blind trial of sprite-gen's `pixel-draw` against an agent writing the recipe directly. Both methods drew
the same two subjects at the same sizes and in the same palettes. The brief is
[13](../../briefs/todo/13-the-sprite-gen-pixel-draw-trial.md).

## Files

| File | What |
|---|---|
| `mate-pal.hex`, `edg32.hex` | The palettes the runs drew in: MateQuest's 32 `MATE_PAL` colours, and EDG32 |
| `pixel-draw/strigoi/`, `pixel-draw/apple-icon/` | The owner's two runs on 2026-11-24, as sprite-gen 4.3.0 wrote them. Each holds two candidates, its own vision pick as the top-level `grid.txt`, the call records and `report.json`. The only change is `report.json`'s `out_dir`, which held the absolute checkout path and is now relative to this folder |
| `agent/` | The agent's two candidates per subject, written straight into recipe form. They were committed (57efa544) before any pixel-draw drawing was read |
| `recipes/` | The four winners as recipes. `*-agent.ts` are the agent's picks (candidate 1 of each). `*-pixel-draw.ts` are each run's `grid.txt`, imported with `npm run recipe:import` |
| [check.ts](check.ts), [check-results.md](check-results.md) | The palette guard and brief 11's recipe checks over the four winners |
| [sheet.ts](sheet.ts), `sheet/`, [blind-sheet.md](blind-sheet.md) | The blind sheet |
| `sealed-order.txt` | Which method is A and which is B, per subject. Each order was drawn with Python's `secrets` and stored base64-encoded, so a glance doesn't give it away |

To rebuild, run these from the repo root:

```bash
T=corpus/verify/2026-11-20-pixel-draw-trial
npm run recipe:import -- mathquest $T/pixel-draw/strigoi/grid.txt --frame enemy/strigoi --out $T/recipes/strigoi-pixel-draw.ts
npm run recipe:import -- farm $T/pixel-draw/apple-icon/grid.txt --frame fruit/apple --out $T/recipes/apple-pixel-draw.ts
node_modules/.bin/tsx $T/check.ts
node_modules/.bin/tsx $T/sheet.ts
```

## "In place" is a mock-up

The in-place pictures are drawn offline. No game build ran, and no game file changed.

- **The strigoi.** MateQuest's own `drawBattle` paints the combat backdrop at 1280×800 into a software surface,
  with the sky's top at 24 px and the ground's bottom at 676.1 px. Both values were read off brief 12's
  `after-strigoi.png`. The same code redraws today's scene and matches that screenshot in all but 18 of its
  192,512 pixels, all on the platforms' curved edges.
- **The strigoi's scale.** Today the combat screen draws its 26 px strigoi at 11×. A 32 px drawing at 11× would
  run off the top of the screen, so both drawings use 8×, the whole-number scale at which 32 px fits today's
  height on screen (286 px). Each stands with its lowest opaque row on the ground line and its opaque columns
  centred on today's centre line. Brief 14 settles the real scale and anchor.
- **The apple.** The background is Farm's hotbar from `farm-back.png`, a real screenshot taken for the camera-edge
  check on 2026-11-24. Slot 6 is cleared below its number, so its caption and count are gone. The apple is drawn
  where the hotbar draws an icon, 26 px square with nearest sampling, as `hotbar.ts` does. A 16 px icon at 1.625×
  makes some art pixels two screen pixels wide and some one. The axe in slot 3, redrawn the same way, matches the
  screenshot pixel for pixel.

## The runs

| Run | Time | Output tokens (thinking) | Cost |
|---|---:|---:|---|
| strigoi, 32 px, two candidates and a vision pick | 168 s | 36,214 (34,896) | Claude login, nothing extra |
| apple icon, 16 px, two candidates and a vision pick | 44 s | 8,268 (7,303) | Claude login, nothing extra |

## Result

Written after the owner's picks (brief 13, step 5).
