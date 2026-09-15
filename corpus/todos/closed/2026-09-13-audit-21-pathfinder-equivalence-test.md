# audit-21 — JS and WASM pathfinders have no equivalence test, and the headless default is the divergent one

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). The corpus already records being bitten by this class once — see [decisions.md](../../wiki/decisions.md) → Concurrency, "Pathfinder choice is load-bearing".

## The gap

Two implementations, both satisfying `PathfinderLike`:
- [games/farm/sim-core/src/world/js-pathfinder.ts](../../../games/farm/sim-core/src/world/js-pathfinder.ts) —
  unweighted BFS, 4-directional, neighbours visited in a fixed `DX`/`DY` order
- the WASM kernel, described by its own test as A*
  ([engine/core/src/wasm/pathfinder.test.ts](../../../engine/core/src/wasm/pathfinder.test.ts))

They are shortest-*length* equivalent but **not route** equivalent — BFS has no tie-break heuristic, A*
explores by cost/heuristic order, so they pick different equal-cost paths and therefore produce different
sim outcomes from the same seed. This is already known and documented.

Nothing anywhere compares them. `pathfinder.test.ts` exercises only WASM;
`games/farm/sim-core/src/world/ports.test.ts` only JS.

And the headless default is the divergent one:
[tools/run-sim/src/pathfinder.ts:10-12](../../../tools/run-sim/src/pathfinder.ts#L10-L12) —
`const kind = (process.env["PATHFINDER"] ?? "js").toLowerCase()`. The browser and both servers use WASM.

## Failure scenario

A readability-motivated refactor reorders `DX`/`DY` in `js-pathfinder.ts` (e.g. to N,E,S,W). Path
*lengths* are unchanged, so the existing length-shaped assertions stay green — but every headless run
(`npm run sim` defaults to JS) now routes farmers differently, silently invalidating any probe or baseline
captured with it, while the WASM path players actually see is untouched. The divergence is invisible until
someone compares a headless probe against live behaviour and cannot explain the gap.

## What to test — and what NOT to

**Do not** assert exact route equality. It is expected to differ; a test asserting it would be wrong and
would have to be deleted.

**Do** assert the contract that is actually relied on:
- same shortest-path **length** for both implementations on the same grid/start/end
- same **reachability** verdict (both find a path, or both find none)
- both respect walls/blocked cells identically
- determinism of each implementation individually: same inputs ⇒ same route, every call

Use a handful of small hand-built grids (10×10 is plenty — open, walled corridor, U-shaped trap,
unreachable target, start == end). Cheap enough for this hardware; no sim run, no world generation.

Also worth a line in the test file or `decisions.md`: state plainly that JS is the `run-sim` default while
WASM is what ships, so the next person reaching for a baseline sets `PATHFINDER=wasm` deliberately.

## Files you OWN
- new test (colocate with whichever side reads more naturally — likely
  `games/farm/sim-core/src/world/pathfinder-equivalence.test.ts`)
- a clarifying comment in [tools/run-sim/src/pathfinder.ts](../../../tools/run-sim/src/pathfinder.ts)

## Files you must NOT touch
- either pathfinder implementation. **Do not "align" them.** Route divergence is accepted and documented;
  changing either one changes sim outcomes and invalidates every existing baseline.
- `engine/wasm-modules/**` and the committed `dist/*.wasm`

## Acceptance
- The equivalence test passes on the current tree and runs in milliseconds.
- It **fails** if `js-pathfinder`'s neighbour order is changed in a way that alters path length or
  reachability, and **still passes** if only the chosen equal-cost route changes. Demonstrate both, then revert.
- The JS-default-vs-WASM-shipped asymmetry is written down where someone capturing a baseline will see it.
