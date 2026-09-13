# audit-18 — Snapshot interpolation is independently re-derived in three clients

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). The clearest case in the repo for an engine promotion — and the author of the third copy said so at the time.

## The duplication

All three continuous-motion clients solve the same generic problem — keep the last two snapshots, derive
a clamped `[0,1]` alpha from the expected inter-arrival interval, lerp each entity by id, snap new or
teleported entities:

- **Farm** — inline in the transport class:
  [net/sim-client/client.ts:87-135, 248-299](../../games/farm/client/src/net/sim-client/client.ts#L87-L135) (~50 lines, mixed into the WebSocket client)
- **Citadel** — [render/entity-interp.ts](../../games/citadel/client/src/render/entity-interp.ts) (405 lines:
  jitter buffer, Catmull-Rom/Hermite corner smoothing, long-segment glide)
- **Hollow** — [render3d/interp.ts](../../games/hollow/client/src/render3d/interp.ts) (136 lines)

There is zero sim-specific content in any of them. They cannot share code today because no game may
import another game — so the shared version has to live in the engine, and nobody put it there.

## Why this is worth doing (the evidence)

Hollow's own module header states the problem outright: it is *"a deliberately SIMPLER single-interval
version"* referencing Citadel's `entity-interp.ts`, and notes that if Hollow's gait needs *"Citadel's
fuller corner-smoothing/jitter-buffer treatment, it can layer that on top of (or replace)
`SnapshotBuffer`"*. The author knew the better implementation existed one game over and re-derived a
weaker one because there was nowhere shared to put it.

Citadel's jitter buffer fixed a **real diagnosed bug** — "hold-then-jump tile-stepping", ~41% → ~2% of
gaps. That fix currently benefits exactly one game. The next continuous-motion game, or a Farm/Hollow
parity complaint, re-derives it a fourth time.

## Fix sketch

Promote a generic buffer into `@engine/core/render` (or `/runtime`):

```ts
RenderInterpolationBuffer<T extends { id: number; x: number; y: number }>
```
— alpha computation + per-id lerp + a snap contract, with Citadel's jitter-buffer and corner-smoothing as
**opt-in** behaviour layered on top, not the default.

Sequence it so nothing regresses:
1. Add the engine primitive with tests; change no game.
2. Adopt in **Hollow** first (the thinnest copy, lowest risk).
3. Adopt in **Farm** (untangle it from the WebSocket transport — the transport keeps its public API).
4. Citadel **last**, behind the opt-in flags, and only if its render output stays identical.

If step 4 cannot be made byte-identical, **stop and leave Citadel on its own implementation** — say so in
the close-out. A shared abstraction that degrades the one game with the good implementation is a
regression, not a cleanup.

## Files you OWN
- new engine module under `engine/core/src/render/` (or `/runtime/`) + tests + the subpath barrel entry
- [games/hollow/client/src/render3d/interp.ts](../../games/hollow/client/src/render3d/interp.ts)
- [games/farm/client/src/net/sim-client/client.ts](../../games/farm/client/src/net/sim-client/client.ts)
- [games/citadel/client/src/render/entity-interp.ts](../../games/citadel/client/src/render/entity-interp.ts) (last, optional)

## Files you must NOT touch
- any `sim-core` — this is entirely a render-side concern
- the engine must stay game-agnostic: no Citadel/Hollow/Farm concepts, names or constants in it
- do not make the new module a value export from a barrel that Node consumers import without checking
  [audit-19](2026-09-13-audit-19-engine-barrel-node-import-gate.md) first

## Acceptance
- One engine primitive; Hollow and Farm consume it; net lines removed is reported.
- **Per-game render output unchanged.** Verify each adopting game in a real browser: Farm farmers and
  Citadel villagers/raiders move as smoothly as before, no tile-stepping, no jitter on slow movers.
- Citadel's jitter-buffer behaviour is preserved exactly if adopted, or explicitly left alone if not.
- `npm run test -w @engine/core` + each touched client green.
