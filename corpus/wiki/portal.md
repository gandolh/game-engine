---
summary: The games portal at /games (portal/, built 2026-11-03) — a card per engine game, each played in a same-origin frame with a Fullscreen button, a warning page under 1280×640 for games that don't play on phones, EDG32 pixel style; the frame check per game, the card art, the deploy stacks, and what the owner still checks.
updated: 2026-11-03
---

# The games portal

A page at `/games` listing this repo's four games as cards; a card opens that game's play page,
which frames the game's own deployed path. Built 2026-11-03 from
[the build spec](../todos/closed/2026-11-03-games-portal.md); the owner's calls (two grills, 2026-10-28
and 2026-11-03) are listed there and in the closed
[research spec](../todos/closed/2026-10-27-game-portal-research.md), which also holds the survey of
Y8 and itch.io the layout follows (Miniclip no longer frames games).

## Shape

- **Where:** the `portal/` workspace (`@game-engine/portal`), a Vite static site served at `/games`
  (`PORTAL_BASE=/games/`). It imports no game code (the layering guard scans it); the apex `/` is
  not the portal.
- **Pages:** the grid (header, four cards of 4:3 art, title, one-line pitch, a "Computer only" tag),
  a play page per game at `/games/<id>/`, and a "Not found" page. The game list is one module,
  [games.ts](../../portal/src/games.ts).
- **The play page:** a header with "← All games", the game's title and a Fullscreen button, then an
  `<iframe>` of the game's path (`allow="fullscreen; autoplay; gamepad"`), full width at about 16:9,
  never shorter than 640 px (the games' floor) and no taller than what is left under the header; the
  description below. The frame takes keyboard focus when it loads, and again after Fullscreen.
- **Phones and tablets:** each game has `playsOnPhones` (all `false`: every game needs the 1280×640
  floor). Under 1280×640, by screen size only, such a game shows a warning page instead of the
  frame: "This game is unavailable for phones or tablets." The page re-renders only when that
  answer flips, so a resize never reloads a running game.
- **The look:** EDG32 colours only (the palette guard scans `portal/`), headings drawn from
  `@engine/ui`'s UNSCII display font onto a canvas ([pixel-text.ts](../../portal/src/pixel-text.ts))
  with the text kept in the DOM, body text in a monospace stack. Two columns on a phone, four from
  1000 px.

## The frame check (2026-11-03)

The four games built with their deploy bases and the portal with `PORTAL_BASE=/games/`, served from
one origin by [serve-all.mjs](../../portal/scripts/serve-all.mjs), which also proxies
`/farm-valley/sim` to the Farm server. Headless Chromium on SwiftShader, load average about 25 (the
machine was busy), 1440×900:

| Game | In the frame |
|---|---|
| Farm Valley | Start clicked inside the frame; the sim socket opened through the proxy and the sim ticked (tick 228 after 20 s) |
| Citadel | Cozy picked by a click inside the frame; Space paused it (the HUD read "Resume"); terrain drawn on patches |
| Hollow | the founding form loads and Start runs the town; **frame time 50 ms framed vs 33 ms opened directly** (p50 over 3 s) |
| MateQuest | `1` opened combat from the map, so keys reach the game |

All four: `document.activeElement` is the frame after load. Fullscreen made the frame the fullscreen
element from a real click (a script's `click()` is refused: fullscreen needs a user gesture). At
412×915 (an Android phone) all four play pages show the warning page. The live games sent no
framing headers in the morning of 2026-11-03. Since vps-deploy's baseline headers went live the same day
they send `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` (curl), which allow the portal,
because it frames them from the same origin.

**Hollow's gap is not a finding yet.** The research's first pass saw the same shape (33 vs 17 ms),
both on SwiftShader under load, and this repo has been misled by a SwiftShader frame rate before
([open-questions.md](open-questions.md) → *FPS regression was a SwiftShader artifact*). Hollow keeps
its frame unless the owner sees the gap on a real GPU; then it opens on its own path instead
(the owner's 2026-10-28 rule).

## Card art

Each card is a 640×480 scene composed by the game's own renderer, behind a DEV-only `?card` flag in
the game's client:

| Game | The scene | Where |
|---|---|---|
| Farm Valley | a small island at 3× (fields of mature crops, Pip's house, a well, a scarecrow, four farmers) baked from its atlas; no sim server | `games/farm/client/src/card.ts` |
| Citadel | a cozy town at midday on the real terrain's core box (hall, houses, chapel, farm, mill, market, well) through `pushScene` | `games/citadel/client/src/render/card.ts` |
| Hollow | seed 42 at 8× for 20 s, then only the 3D town (every overlay hidden), paused | `MountOptions.card` in `mount.ts` |
| MateQuest | Făt-Frumos facing a zmeu on the battle backdrop: the combat screen's `drawBattle`, without its HUD | `games/mathquest/client/src/card.ts` |

`npm run cards -w @game-engine/portal` ([cards.ts](../../portal/scripts/cards.ts)) starts any dev
server that isn't up, waits for `window.__cardReady`, screenshots at 640×480 and maps every pixel
to the nearest colour of the game's palette (Farm EDG32, Citadel and Hollow Apollo-46, MateQuest
Resurrect-64), because the wash and Hollow's 3D shading are not on it. The portal's test fails a
card with any colour off its palette. Retake when a game's sprites change; it needs `agent-browser`.

## Deploy

vps-deploy has two static stacks on the game-engine checkout, modelled on Hollow's (its commit
`83717f9`; the Caddyfile was regenerated with that repo's baseline headers in `bdbba39`):
`mathquest` at `/mathquest/` (`MATHQUEST_BASE`), its first deploy, and `games-portal` at `/games/`
(`PORTAL_BASE`), whose play pages come from the single-page fallback. The baseline
`X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` allow the frames, which are same-origin.
Neither is deployed.

## For the owner

- Hollow framed against direct on a real GPU (the play page's frame, then `/hollow/` on its own).
- A phone (Android): the grid in two columns and the warning page.
- Push game-engine and vps-deploy, then deploy `mathquest` and `games-portal` (`node cli.ts mathquest all`,
  `node cli.ts games-portal all`), and the three deployed games for the patches and the upside-down fix.
