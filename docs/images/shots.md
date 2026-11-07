# README images

How each image was made, so the next refresh is a re-run. Retake an image when the screen it shows changes. All four were taken in headless Chrome, which renders WebGL2 in software, so expect 3 to 10 frames per second: the two dated 2026-10-09 with agent-browser, the two dated 2026-11-07 with Playwright's Chromium launched with `--use-angle=swiftshader --enable-unsafe-swiftshader`.

| File | Shows | How to reach that state | Viewport | Data | Taken |
|---|---|---|---|---|---|
| four-games.webp | The four games in a 2×2 grid | One screenshot per game (below), each scaled to 1200×750 and stacked with a 12 px gap | 1440×900 @2x each | see each row | 2026-11-07 |
| mathquest-combat.gif | Map, then two correct answers landing as hits | `npm run dev -w @mathquest/client -- --port 5311 --strictPort`, fresh page. Click the top-left map node, Attack, 3, Trimite; then Attack and `>` | 1280×800 @1x | the default run (problems: 5 - 2, then compare 10 and 7) | 2026-10-09 |
| hollow-chronicle.webp | Hollow's chronicle and metric charts beside the 3D town | Crop of the full 2880×1800 Hollow capture: top-left 1440×1360 px | 1440×900 @2x | seed 42 | 2026-10-09 |
| farm-farmers-panel.webp | Farm Valley's Farmers panel beside Pip's island | Crop of the full 2880×1800 Farm capture: 1440×1360 px starting 1440 px from the left | 1440×900 @2x | seed 0xc0ffee | 2026-11-07 |

## The four grid tiles

Each was captured at 1440×900 @2x, after hiding the engine's debug overlay (fps, tick, entity count), which is a plain `div` with `white-space: pre`. Until 2026-10-09 the tiles came from the deployed games (MateQuest from a local dev server, since it is not deployed). Since 2026-11-07 they come from a local production build of `main`, served from one origin the way the VPS serves them: build the four clients and the portal with the commands at the top of `portal/scripts/serve-all.mjs`, then run `npm run server` (Farm's sim, :8787) and `PORT=8090 npm run serve-all -w @game-engine/portal`, and open the paths below on `http://localhost:8090`. The overlay snippet:

```js
[...document.querySelectorAll("div")].filter(d => d.style.whiteSpace === "pre").forEach(d => d.style.display = "none")
```

- **Farm Valley.** Open `/farm-valley/`, click Start (seed 0xc0ffee), wait about 25 s for the sim, zoom in two mouse-wheel steps, open Panels → Farmers, and capture at midday on the first day. The clock is one game minute per tick from 6:00 AM, so 12:25 PM is tick 385; read the tick off the debug overlay before hiding it. Since 2026-11-07 the clock and the Farmers panel number the first day "Day 0" (the 2026-10-09 capture read "Day 1" at the same point in the run). Park the pointer on the panel's empty area so no button shows its hover colour.
- **Citadel.** Open `/citadel/?cozy`, which skips the ruleset picker. Extend the starter road south-east with the road tool, then place two houses beside it and a well, a chapel and a market off it. Run a few days, then pick the road tool so no placement ghost shows, and park the pointer over the build bar. The 2026-11-07 layout, in tiles (the starter road is x 90–101 on y 96): road dragged from (102, 96) to (108, 96), houses at (103, 97) and (106, 97), chapel at (103, 94), market at (106, 94), well at (108, 98), which leaves Wood 14; then 4x until Day 5, back to 1x, and about 12 s for the day's event toasts to fade. The dev server's `window.__citadel.tileToScreenCss` gives each tile's screen point at the boot camera; the production build boots to the same camera.
- **Hollow.** Open `/hollow/`, set the seed to 42, Start, choose 4x and run about 40 s (to year 18).
- **MateQuest.** Fresh page, click the top-left map node, then Attack, so the first problem shows.

GIF: the MateQuest frames are single screenshots, joined with ffmpeg's concat demuxer (1.0 to 2.2 s per frame), then `fps=10,scale=960:-1` with a two-pass 128-colour palette. Screenshots convert with `ffmpeg -i shot.png -c:v libwebp -quality 82 shot.webp`.

No real names or accounts appear. The farmer, villager and hero names on screen are the games' own generated content.
