# Worker snapshot transfer

status: open. Promote when receiving and applying a snapshot on the main thread takes more than 2 ms
at p95 in the Citadel, Hollow or MateQuest bench.
created: 2026-11-20
context: the 60 fps plan, [frame-budget.md](../wiki/frame-budget.md).

Citadel, Hollow and MateQuest run their sims in a Web Worker and post each snapshot as a plain
object (`games/*/client/src/worker/sim-worker.ts`). `postMessage` copies it with structured clone,
and the main thread pays to rebuild it before the frame can use it. Farm's numbers don't carry
over: its sim is on a server and its snapshots arrive as JSON over a WebSocket.

If it is promoted, the industry answer is a struct-of-arrays snapshot in typed arrays, passed in the
transfer list so nothing is copied. Positions, frames and flags go in `Float32Array` and
`Uint16Array`. Strings that rarely change, such as names and tooltips, go in a separate message sent
only on change. Measure the clone first, with a named timer on both sides.
