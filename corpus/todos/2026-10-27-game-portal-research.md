# A games portal page (research)

status: todo
created: 2026-10-27
context: the owner, 2026-10-27: a web page "like miniclip or y8games", a home page of squares with
an image for each game, where a click plays the game on that site. Research only; not grilled yet.

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

## Settle when grilling

1. **Where it lives.** A new workspace in this repo (for example `portal/`, importing no game
   code), a page in showcase, or its own small repo. And where it is served: `/games`, `/arcade`
   or the apex `/`.
2. **How a game plays "on the site".** Opening the game's own path, or an `<iframe>` of it inside
   the portal with the portal's header around it. Same origin, so the iframe is allowed; the
   questions are keyboard focus, fullscreen (`allow="fullscreen"`), Farm's WebSocket and phones.
3. **Which games.** The four engine games, MateQuest included once it has a stack. Games in other
   repos only if the owner adds them.

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
