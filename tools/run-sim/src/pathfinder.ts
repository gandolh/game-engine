import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsPathfinder } from "@farm/sim-core/world/js-pathfinder";
import { createPathfinderFromBytes } from "@engine/core";
import type { PathfinderLike } from "./run-core";

export async function makePathfinder(): Promise<PathfinderLike> {
  // NOTE(audit-21): "js" (unweighted BFS) is the default here for run-sim, but
  // it is NOT what ships — the browser clients and both game servers always use
  // the WASM A* kernel. JS and WASM are shortest-LENGTH equivalent but not
  // ROUTE equivalent (different tie-breaking on equal-cost paths -> different
  // farmer routes -> different sim outcomes from the same seed). See
  // games/farm/sim-core/src/world/pathfinder-equivalence.test.ts for the
  // contract that's actually guaranteed between them, and
  // corpus/wiki/decisions.md ("Pathfinder choice is load-bearing") for why this
  // matters. If you are capturing a determinism baseline meant to represent
  // what players see, set PATHFINDER=wasm explicitly — this default will not
  // do it for you.
  const kind = (process.env["PATHFINDER"] ?? "js").toLowerCase();
  if (kind === "wasm") {
    const here = dirname(fileURLToPath(import.meta.url));
    const wasmPath = resolve(
      here,
      "../../../engine/wasm-modules/dist/pathfinding.wasm",
    );
    const buf = readFileSync(wasmPath);
    const bytes = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
    return (await createPathfinderFromBytes(bytes)) as unknown as PathfinderLike;
  }
  return new JsPathfinder();
}
