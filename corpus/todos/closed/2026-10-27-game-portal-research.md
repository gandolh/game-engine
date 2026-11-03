# A games portal page (research)

> **Closed 2026-11-03 into a build spec.** At the 2026-11-03 grill the owner chose to build the portal
> instead of finishing this research. Steps 2 to 4 are now checks in
> [the build spec](../2026-11-03-games-portal.md). The findings below (step 1, and step 2's first pass)
> stay as the record.

> **Owner, 2026-11-03: build it.** The research closes into a build spec. Farm's WebSocket in the
> frame, phones and the card images are checked during the build. The live games send no
> `X-Frame-Options` or CSP `frame-ancestors` (curl, 2026-11-03), so framing them needs no header change.
> Phones (owner, 2026-11-03): each game says whether it plays on phones and tablets. One that does
> not opens a warning page there instead of the game ("this game is unavailable for phones or
> tablets"). Today no game does: all four need the 1280×640 floor.
> Detection is by screen size only: the warning shows when the viewport is under 1280×640. A large
> tablet in landscape opens the game.
> Look (owner, 2026-11-03): pixel style, with colours from EDG32 and the engine's pixel font for headings.
> The palette scan covers `portal/`.
> Card images (owner, 2026-11-03): made art for each card, 4:3, not captures.
> Each card is composed in code from its game's own sprites and palette by a build step that can be
> rerun when the sprites change, and the owner reviews it in a browser. Hollow has no sprites (vertex-coloured
> 3D), so its card is a posed render of its 3D scene cut down to Hollow's palette.
> vps-deploy (owner, 2026-11-03): this run adds the portal and MateQuest static stacks there, modelled
> on `stacks/hollow.ts`, committed on its main and neither pushed nor deployed. The owner runs the rollout.

status: todo
created: 2026-10-27
context: the owner, 2026-10-27: a web page "like miniclip or y8games", a home page of squares with
an image for each game, where a click plays the game on that site. Research only. Grilled 2026-10-28;
the answers are under "Settled at the grill".

## What exists

- Three games are deployed by `vps-deploy`, each a static Vite build on its own path of the
  production domain: Farm Valley (with its sim server behind a WebSocket), Citadel and Hollow.
  The engine docs are at `/game-engine/docs`.
- **MateQuest is not deployed**: there is no stack for it in vps-deploy. Its client already reads
  `MATHQUEST_BASE` ([`vite.config.ts`](../../../games/mathquest/client/vite.config.ts)), so a static
  stack like Hollow's would serve it.
- The apex `/` has no page: it answers 404 (vps-deploy brief 19 makes that a plain "not found"
  page).
- The owner's portfolio, `showcase`, already has a card grid with filters (picked 2026-09-27
  over a metaphor-led design). Keep the portal's layout just as familiar: a grid of cards, a
  title, a click.

## Settled at the grill (2026-10-28)

1. **Where it lives: a `portal/` workspace in this repo, served at `/games`.** It imports no game
   code. It gets its own static stack in `vps-deploy`; the apex `/` stays as it is.
2. **A game plays inside the portal**: an `<iframe>` of the game's own path under the portal's
   header, with a fullscreen button (`allow="fullscreen"`), like Miniclip. Same origin, so the
   frame is allowed. Check keyboard focus, fullscreen, Farm's WebSocket and phones per game; a game
   that misbehaves in the frame opens on its own path instead, and the findings say which and why.
3. **All four engine games**, MateQuest included: the follow-up specs give it a static stack in
   `vps-deploy` like Hollow's (its client already reads `MATHQUEST_BASE`). No games from other
   repos.

## What to find out

1. **The pattern.** What Miniclip, Y8 and itch.io's browser games do: card size and content
   (image, title, one-line pitch, tags), the play page (iframe, sidebar, fullscreen button), and
   what each does on a phone. Screenshots go in `corpus/verify/`, not in the wiki.
2. **The iframe test.** Load each deployed game in an iframe on a local page and record: keyboard
   and mouse input, focus after a click, fullscreen, audio start, the WebSocket (Farm), the Worker
   (Citadel, Hollow, MateQuest), and the frame rate against the game opened directly.
3. **Card images.** How to make one per game that stays current: a capture of the running game's
   canvas, Farm's `world-preview` PNG, or art made for the card. The README's captures are a
   starting point.
4. **What it adds to vps-deploy.** A static stack for the portal and one for MateQuest; whether the
   games need a header change to be framed (`X-Frame-Options`, `frame-ancestors`). Write these as
   proposed vps-deploy briefs, not as changes.

## Deliverable

- A wiki page, `portal.md`, with the findings, a recommended shape for each grill question and a
  rough card-grid sketch (HTML in `corpus/verify/` is fine).
- The proposed follow-up specs for this repo and briefs for vps-deploy, for the owner to approve.
- No code in `engine/` or `games/`.

## Paused 2026-10-28 (run cut to three agents): where this stopped

Still open, in this file. Only step 1 (the pattern survey) is done; its screenshots are in
[verify/2026-10-28-portal-research/](../../verify/2026-10-28-portal-research/) (11 JPEGs, taken with
headless Chromium on 2026-10-28). Measured there:

- **Miniclip** is no longer a portal: its web page is two big banners (640×377 at 1280 wide) whose
  "Play now" links out to each game's own site; nothing is embedded. Y8 and itch.io are the models.
- **Y8**: cards 180×135 (4:3 image filling the card, title and rating over it), about 6 columns on
  desktop, 2 on a phone (135×101). The play page frames the game in an `<iframe>` from a separate
  CDN domain with `allow="autoplay"` and `allowfullscreen`, no sandbox; a sidebar and ads beside
  it; a fullscreen button on the player. On a phone the play page has no iframe until a tap
  launches the game (inferred, not tapped).
- **itch.io** browser games: 4 columns of 237×301 cards (5:4 image, title, one-line pitch, author,
  genre tag); the play page shows a "Run game" button first, then an `<iframe>` from a separate
  domain with a long `allow` list (`fullscreen *`, `autoplay`, `gamepad`, …) and no sandbox. On a
  phone, 2 columns and a full-viewport iframe after the tap.
- Takeaway for four games: a 2×2 or 4×1 grid of larger cards (about 280 px wide), 4:3 or 16:10
  image, title, one-line pitch; play page = header, ~16:9 iframe, fullscreen button, description.

**Not done:** step 2 (the iframe test: build the four games with their `*_BASE`, serve them and a
local portal page from one origin, Farm's WebSocket through a proxy), step 3 (card images), step 4
(`curl -I` the deployed games for `X-Frame-Options`/`frame-ancestors`, and the proposed vps-deploy
briefs), `portal.md`, the card-grid sketch and the follow-up specs. No code was written for it.

### Resumed and stopped again 2026-10-28 (session ended): step 2, first pass

The four games were built with their deploy bases (`/farm-valley/`, `/citadel/`, `/hollow/`,
`/mathquest/`) and served with a local play page (header, `<iframe allow="fullscreen; autoplay;
gamepad">`, a Fullscreen button) from **one origin** by a small Node server that upgrades
`/farm-valley/sim` to the Farm sim server. One run per game, headless Chromium + SwiftShader, load
average 0.6 at the start and 6.7 at the end:

- **Focus**: a click inside the frame leaves the parent's `activeElement` on the `IFRAME` for all
  four, and keys then reach the game: Citadel's picker took Tab + Enter and Space toggled pause
  (the HUD read "Resume"); MateQuest's map took `1` and opened combat.
- **Fullscreen**: the portal button made the iframe `document.fullscreenElement` for all four.
- **Audio**: Farm's and Citadel's `AudioContext` reported `running` after the click in the frame;
  Hollow and MateQuest create none.
- **Workers**: Hollow's chronicle grew 109 → 201 lines in 4 s inside the frame; Citadel and
  MateQuest ran.
- **Farm, not verified**: Enter after the click did not start the run, so no WebSocket opened and the
  `/farm-valley/sim` path through the frame is unchecked. Next: click Farm's Start button by
  coordinates inside the frame.
- **Frame rate** (rAF p50, 5 s each, framed vs direct): Farm 16.7 / 16.7 ms, Citadel 33.3 / 33.3,
  Hollow 33.3 / 16.7, MateQuest 33.4 / 366.7 (the direct page was still booting). SwiftShader and
  one run: no claim.

Still not done: Farm's WebSocket in the frame, a phone viewport, step 3 (card images; the README
captures and `docs/images/shots.md` are the starting point), step 4 (`curl -I` the deployed games
for `X-Frame-Options`/`frame-ancestors`, proposed vps-deploy briefs for a portal stack and a
MateQuest stack), `portal.md`, the card-grid sketch, the follow-up specs. The build/serve scripts
lived in the session scratchpad and are gone; recreate them from this description.
