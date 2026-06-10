import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsPathfinder } from "@farm/sim-core/world/js-pathfinder";
import { createPathfinderFromBytes } from "@engine/core";
import type { PathfinderLike } from "./run-core";

/**
 * Create the pathfinder used for headless runs.
 *
 * Default is the pure-JS BFS `JsPathfinder`: stateless, deterministic, no WASM,
 * no memory faults, identical paths on every call with the same inputs.
 *
 * `PATHFINDER=wasm` instead instantiates the WASM A* pathfinder from the
 * committed `packages/wasm-modules/dist/pathfinding.wasm` — the SAME pathfinder
 * the browser worker (and the Node WS server, brief 57) use. This matters
 * because the JS and WASM pathfinders are NOT route-equivalent (they pick
 * different equal-cost paths), so a run's outcome depends on which one is used.
 * Use `wasm` to reproduce browser/server behavior; the default `js` matches
 * legacy headless runs. Both satisfy the `PathfinderLike` duck type.
 */
export async function makePathfinder(): Promise<PathfinderLike> {
  const kind = (process.env["PATHFINDER"] ?? "js").toLowerCase();
  if (kind === "wasm") {
    const here = dirname(fileURLToPath(import.meta.url));
    const wasmPath = resolve(
      here,
      "../../../packages/wasm-modules/dist/pathfinding.wasm",
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
