# The games portal

A page at `/games` with a card for each of this repo's four games; a card opens the game's play
page, which frames the game's own deployed path (`/farm-valley/`, `/citadel/`, `/hollow/`,
`/mathquest/`) with a Fullscreen button. Under 1280×640 a game that doesn't play on phones and
tablets shows a warning page instead. It imports no game code.

```bash
npm run portal                                   # dev server on :5177 (the frames point at paths it doesn't serve)
PORTAL_BASE=/games/ npm run build -w @game-engine/portal
npm run serve-all -w @game-engine/portal         # the portal and the four built games from one origin
```

The design and the checks are in the corpus: `corpus/wiki/portal.md`.
