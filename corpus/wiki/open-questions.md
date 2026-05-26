# Open Questions & Gaps

Live list of unresolved work and design questions. Items move out of here when a brief is written in [../briefs/](../briefs/) and back in (or get deleted) when answered.

## Code gaps (have a clear "next step")

_No code-level gaps tracked right now — the three from the 08/09/10 round (act.ts bypass, CNP coordinator registry, responder-side trust delta) all landed in the cleanup pass. Visuals and polish below are open as design questions._

## Design questions (no clear answer yet)

- **Animated walking sprites between tile steps.** Today the renderer interpolates `Transform.{x,y}` with `alpha`, but farmer sprites snap from one tile to the next every `STEP_TICKS=5` (10Hz) — they don't show a walking animation. Bigger lift: a sprite animation clip + frame swap during travel.
- **Slate billboard in the village.** The shopkeeper's daily slate is broadcast on the bus and consumed by personalities, but a human observer can't see the offer prices/stock without inspecting state. A small DOM/canvas overlay near the shopkeeper tile would close this.
- **MEET indicator.** When two farmers share a region they emit `ENCOUNTER.MEET` but the player sees nothing visual. A speech bubble or icon during the cooldown window would make peer trades legible.
- **Tilemap layer on Canvas2D?** The original [01-tilemap](../briefs/engine/superseded/01-tilemap.md) brief was WebGPU. Background is currently drawn ad-hoc per-tile. Open question: do we need a real chunked tile layer? Only relevant if/when perf demands it (today's 40×40 grid at 60fps is comfortable).
- **Sim → Web Worker move.** [decisions.md](decisions.md) keeps the sim "pure so it can move to a Web Worker later." No trigger to do this yet.
- **Asymmetric / fifth personality?** [overview.md](overview.md) lists 4 personalities and the day-100 winner (Atticus, 2086g) is consistently aggressive. A banker or saboteur archetype could add strategic depth.
