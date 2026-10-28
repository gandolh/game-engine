# A games portal page (research)

status: todo
created: 2026-10-27
context: the owner, 2026-10-27: a web page "like miniclip or y8games", a home page of squares with
an image for each game, where a click plays the game on that site. Research only. Grilled 2026-10-28;
the answers are under "Settled at the grill".

## What exists

- Three games are deployed by `../vps-deploy`, each a static Vite build on its own path of the
  production domain: Farm Valley (with its sim server behind a WebSocket), Citadel and Hollow.
  The engine docs are at `/game-engine/docs`.
- **MateQuest is not deployed**: there is no stack for it in vps-deploy. Its client already reads
  `MATHQUEST_BASE` ([`vite.config.ts`](../../games/mathquest/client/vite.config.ts)), so a static
  stack like Hollow's would serve it.
- The apex `/` has no page: it answers 404 (vps-deploy brief 19 makes that a plain "not found"
  page).
- The owner's portfolio, `../showcase`, already has a card grid with filters (picked 2026-09-27
  over a metaphor-led design). Keep the portal's layout just as familiar: a grid of cards, a
  title, a click.

## Settled at the grill (2026-10-28)

1. **Where it lives: a `portal/` workspace in this repo, served at `/games`.** It imports no game
   code. It gets its own static stack in `../vps-deploy`; the apex `/` stays as it is.
2. **A game plays inside the portal**: an `<iframe>` of the game's own path under the portal's
   header, with a fullscreen button (`allow="fullscreen"`), like Miniclip. Same origin, so the
   frame is allowed. Check keyboard focus, fullscreen, Farm's WebSocket and phones per game; a game
   that misbehaves in the frame opens on its own path instead, and the findings say which and why.
3. **All four engine games**, MateQuest included: the follow-up specs give it a static stack in
   `../vps-deploy` like Hollow's (its client already reads `MATHQUEST_BASE`). No games from other
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
