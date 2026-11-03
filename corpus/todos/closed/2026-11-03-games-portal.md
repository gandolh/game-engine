# The games portal at `/games`

> **Done 2026-11-03.** Built as specified ([portal.md](../../wiki/portal.md) has the record). In order:
> 1. The `portal/` workspace and its guards (`f933b327`).
> 2. The frame check, with all four games playing in their frames: Farm's socket through the proxy, Citadel's Space, MateQuest's `1`,
>    Hollow running. Fullscreen works from a real click, and a 412×915 viewport shows the warning page for
>    all four.
> 3. vps-deploy's `mathquest` and `games-portal` stacks (`83717f9` there).
> 4. The card art (`b13129c1`): a DEV-only `?card` scene per game, captured and mapped onto its palette
>    by `npm run cards`. MateQuest's battle backdrop became `drawBattle`, which `drawScene` now calls
>    unchanged.
>
> Hollow framed ran 50 ms per frame against 33 ms opened directly, on SwiftShader under load 25, so
> it stays framed until the owner measures it on a real GPU.
>
> Tests: portal 12, Farm 273, Citadel 589, MateQuest 109, Hollow 339, the guards 18. The
> typecheck passes (22 tasks).

status: todo
created: 2026-11-03
context: the [portal research](2026-10-27-game-portal-research.md), closed into this
spec at the 2026-11-03 grill. Its findings (the Y8 and itch.io pattern, and the first iframe pass)
are in that file. The owner's calls from both grills are listed below and are not reopened here.

## Settled (2026-10-28 and 2026-11-03)

- **Where:** a `portal/` workspace in this repo, served at `/games`. It imports no game code (the
  engine is fine). The apex `/` stays as it is.
- **Playing:** a game plays inside the portal, in an `<iframe>` of the game's own path under the
  portal's header, with a Fullscreen button (`allow="fullscreen; autoplay; gamepad"`). A game that
  misbehaves in the frame opens on its own path instead, and `portal.md` says which one and why.
- **Games:** all four engine games: Farm Valley `/farm-valley/`, Citadel `/citadel/`, Hollow
  `/hollow/`, MateQuest `/mathquest/`. No games from other repos.
- **Phones:** each game declares whether it plays on phones and tablets. When the viewport is
  under 1280×640 (screen size only, not touch detection), a game that doesn't play there opens a
  warning page instead: "This game is unavailable for phones or tablets." It has a way back to
  the grid. Today all four are computer-only.
- **Look:** pixel style. All colours come from EDG32, and headings use the engine's UNSCII font. The
  layout is familiar: a header, a grid of cards, and a play page.
- **Card art:** made art, 4:3, composed in code from each game's own sprites and palette. It is not a
  screenshot. Hollow has no sprites, so its card is a posed render of its 3D scene in Hollow's palette.
  The owner reviews the art in a browser.
- **Deploy:** this run adds a portal stack and a MateQuest stack to vps-deploy, modelled on its
  `stacks/hollow.ts`, and commits them on its main. Nothing is pushed or deployed.

## What to do

1. **The workspace.** `portal/` (`@game-engine/portal`), a Vite static site, added to the root
   `workspaces`. The base comes from `PORTAL_BASE` (default `/`), like the games' `*_BASE`. It
   declares `dev`, `build`, `typecheck` and `test` scripts. A workspace without `test` is silently
   skipped. The game list is one typed module: id, title, one-line pitch, a longer description,
   path, `playsOnPhones` and card art file.
2. **Pages.**
   - The grid: a header, then one card per game (art, title, pitch, and a "Computer only" tag
     when it doesn't play on phones). About 280 px cards on desktop, two columns on a phone
     (the research's measurements). A click opens the game's play page.
   - The play page, one URL per game under `/games/`: the header with a way back, the framed game at
     about 16:9 filling the width, a Fullscreen button (`requestFullscreen` on the frame), and
     the description. Under 1280×640 a computer-only game shows the warning page instead, checked
     at load and on resize.
   - The text stays real DOM text: the pixel headings are drawn from `@engine/ui`'s UNSCII glyph
     data, and their text is also in the DOM for screen readers and search.
3. **Card art.** Each game client gets a DEV-only `?card` flag, like Citadel's `?showcase`, that
   draws a posed 4:3 scene with its own renderer and sprites:
   - Farm: an island with fields and farmers;
   - Citadel: a small town on its iso grid;
   - MateQuest: the hero facing a creature;
   - Hollow: a posed view of the 3D town.

   A portal script boots each game's dev server, opens `?card` in headless Chromium (agent-browser,
   as `docs/images/shots.md` does), and saves the canvas as a PNG under `portal/public/cards/`. Washes and 3D shading aren't on the palette,
   so the script maps every pixel to the nearest colour of the game's palette before saving.
   Document the re-run in `portal/README.md`. The art shows no debug overlay.
4. **Guards.** The palette scan walks `portal/` against EDG32 (HTML and CSS included). The
   layering guard scans `portal/` and fails on any game import.
5. **The frame check.** Build the four games with their deploy bases and the portal with
   `PORTAL_BASE=/games/`, then serve them all from one origin with a small Node server in
   `portal/scripts/`. It also upgrades `/farm-valley/sim` to Farm's sim server. In headless
   Chromium, check per game:
   - keys reach the game after a click in the frame;
   - Fullscreen works;
   - Farm's WebSocket opens (click Start inside the frame);
   - the warning page appears at a phone viewport (Android sizes, e.g. 412×915).

   Hollow measured 33 ms per frame framed against 17 ms opened directly in one software-rendered run. Re-measure it.
   Make it fall back to its own path only if the gap holds on a real GPU, which is the owner's check (listed in `portal.md`).
6. **vps-deploy.** Add two stacks there, modelled on `stacks/hollow.ts`:
   - `portal`: base `/games/`, `PORTAL_BASE`, `distDir: "portal/dist"`;
   - `mathquest`: base `/mathquest/`, `MATHQUEST_BASE`, `distDir: "games/mathquest/client/dist"`.

   Wire them the way Hollow's stack is wired, run that repo's own checks, and commit there with a corpus
   note. Don't push or deploy.
7. **Corpus.**
   - Add a wiki page, `portal.md`: what was built, the frame findings per game, how to re-run the card art,
     and the owner's checks.
   - Link it from `index.md` and `status.md`.
   - Never write the live domain anywhere: the games and the portal use paths only.

## Acceptance

- `npm run build -w @game-engine/portal` with `PORTAL_BASE=/games/` builds, and its tests pass. The tests cover:
  - the game list's shape;
  - the warning rule at 1279×640, 1280×639 and 1280×640;
  - the play-page routing.
- `npm run typecheck`, and the palette and layering guards (`npm run test -w @engine/core`), pass.
- In headless Chromium, from one origin: the grid shows four cards with art; each game plays in
  the frame with keys and Fullscreen working; Farm's WebSocket opens; a phone viewport shows the
  warning page for all four.
- The four card PNGs exist and use only their game's palette (a test reads the PNGs' colours).
- vps-deploy has both stacks committed and its checks pass.
