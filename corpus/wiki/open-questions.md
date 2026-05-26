# Open Questions & Gaps

Live list of unresolved work and design questions. Items move out of here when a brief is written in [../briefs/](../briefs/) and back in (or get deleted) when answered.

## Code gaps (have a clear "next step")

_No code-level gaps tracked right now — the three from the 08/09/10 round (act.ts bypass, CNP coordinator registry, responder-side trust delta) all landed in the cleanup pass. Visuals and polish below are open as design questions._

## Design questions (no clear answer yet)

- **Tilemap layer on Canvas2D?** The original [01-tilemap](../briefs/engine/superseded/01-tilemap.md) brief was WebGPU. Background is currently drawn ad-hoc per-tile. Open question: do we need a real chunked tile layer? Only relevant if/when perf demands it (today's 40×40 grid at 60fps is comfortable).
- **Sim → Web Worker move.** [decisions.md](decisions.md) keeps the sim "pure so it can move to a Web Worker later." No trigger to do this yet.
- **Asymmetric / fifth personality?** Per the design interview, the answer was *no balance work, moments matter*. So this is on ice unless the runs start feeling stale. Atticus consistently wins; that's coherent narrative, not a bug.
- **Decision rationale trace (BDI "why").** During the design interview, the user picked the lighter "visual emphasis + current/next intention" answer over a full reasoning log. Revisit if you start watching focused farmers and find yourself wanting to know *why* they decided things.
