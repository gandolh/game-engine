---
summary: The games portal at /games (portal/, built 2026-11-03) — a card per engine game, each played in a same-origin frame with a Fullscreen button, a warning page under 1280×640 for games that don't play on phones, EDG32 pixel style; the frame check per game, the card art, the deploy stacks, and what the owner still checks.
updated: 2026-11-03
---

# The games portal

A page at `/games` listing this repo's four games as cards; a card opens that game's play page,
which frames the game's own deployed path. Built 2026-11-03 from
[the build spec](../todos/2026-11-03-games-portal.md); the owner's calls (two grills, 2026-10-28
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
412×915 (an Android phone) all four play pages show the warning page. The live games send no
`X-Frame-Options` or CSP `frame-ancestors` (curl, 2026-11-03), so framing needs no header change.

**Hollow's gap is not a finding yet.** The research's first pass saw the same shape (33 vs 17 ms),
both on SwiftShader under load, and this repo has been misled by a SwiftShader frame rate before
([open-questions.md](open-questions.md) → *FPS regression was a SwiftShader artifact*). Hollow keeps
its frame unless the owner sees the gap on a real GPU; then it opens on its own path instead
(the owner's 2026-10-28 rule).

## Card art

_Placeholders on each game's palette until the card art lands (next step of the spec)._

## Deploy

_The portal and MateQuest stacks in vps-deploy are the spec's next step._

## For the owner

- Hollow framed against direct on a real GPU (the play page's frame, then `/hollow/` on its own).
- A phone (Android): the grid in two columns and the warning page.
- The deploy, once vps-deploy has the stacks.
