import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsPathfinder } from "@farm/sim-core/world/js-pathfinder";
import { createPathfinderFromBytes } from "@engine/core";
import type { PathfinderLike } from "./run-core";

// JS and WASM pathfinders are NOT route-equivalent (different equal-cost tie-breaks).
// Use PATHFINDER=wasm to match browser/server behavior; default `js` matches legacy headless runs.
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
