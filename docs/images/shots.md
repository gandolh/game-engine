# README images

How each image was made, so the next refresh is a re-run. Retake an image when the screen it shows changes. All four were taken on 2026-10-09 in headless Chrome (agent-browser), which renders WebGL2 in software, so expect 4 to 10 frames per second.

| File | Shows | How to reach that state | Viewport | Data | Taken |
|---|---|---|---|---|---|
| four-games.webp | The four games in a 2×2 grid | One screenshot per game (below), each scaled to 1200×750 and stacked with a 12 px gap | 1440×900 @2x each | see each row | 2026-10-09 |
| mathquest-combat.gif | Map, then two correct answers landing as hits | `npm run dev -w @mathquest/client -- --port 5311 --strictPort`, fresh page. Click the top-left map node, Attack, 3, Trimite; then Attack and `>` | 1280×800 @1x | the default run (problems: 5 - 2, then compare 10 and 7) | 2026-10-09 |
| hollow-chronicle.webp | Hollow's chronicle and metric charts beside the 3D town | Crop of the full 2880×1800 Hollow capture: top-left 1440×1360 px | 1440×900 @2x | seed 42 | 2026-10-09 |
| farm-farmers-panel.webp | Farm Valley's Farmers panel beside Pip's island | Crop of the full 2880×1800 Farm capture: 1440×1360 px starting 1440 px from the left | 1440×900 @2x | seed 0xc0ffee | 2026-10-09 |

## The four grid tiles

Each was captured from the deployed game (MateQuest from a local dev server, since it is not deployed) at 1440×900 @2x, after hiding the engine's debug overlay (fps, tick, entity count), which is a plain `div` with `white-space: pre`:

```js
[...document.querySelectorAll("div")].filter(d => d.style.whiteSpace === "pre").forEach(d => d.style.display = "none")
```

- **Farm Valley.** Open <https://gandolh.ro/farm-valley/>, click Start (seed 0xc0ffee), wait about 25 s for the sim, zoom in two mouse-wheel steps, open Panels → Farmers, and capture at midday on day 1.
- **Citadel.** Open <https://gandolh.ro/citadel/?cozy>, which skips the ruleset picker. Extend the starter road south-east with the road tool, then place two houses beside it and a well, a chapel and a market off it. Run a few days, then pick the road tool so no placement ghost shows, and park the pointer over the build bar.
- **Hollow.** Open <https://gandolh.ro/hollow/>, set the seed to 42, Start, choose 4x and run about 40 s (to year 18).
- **MateQuest.** Fresh page, click the top-left map node, then Attack, so the first problem shows.

GIF: the MateQuest frames are single screenshots, joined with ffmpeg's concat demuxer (1.0 to 2.2 s per frame), then `fps=10,scale=960:-1` with a two-pass 128-colour palette. Screenshots convert with `ffmpeg -i shot.png -c:v libwebp -quality 82 shot.webp`.

No real names or accounts appear. The farmer, villager and hero names on screen are the games' own generated content.
