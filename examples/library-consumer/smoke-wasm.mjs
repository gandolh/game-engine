// Smoke test for @engine/wasm-modules consumed through @engine/core/wasm.
//
// @engine/core/wasm ships the JS wrapper (Pathfinder); @engine/wasm-modules ships only the
// compiled .wasm bytes (see its package.json exports: "./pathfinding.wasm" etc). A real
// consumer loads the bytes itself and hands them to createPathfinderFromBytes — this proves
// that seam works end-to-end from two separately-installed tarballs.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createPathfinderFromBytes } from "@engine/core/wasm";

const require = createRequire(import.meta.url);
const wasmPath = require.resolve("@engine/wasm-modules/pathfinding.wasm");
const bytes = readFileSync(wasmPath);

const pf = await createPathfinderFromBytes(bytes);

// Tiny 5x1 empty strip — straight line start -> end (grid semantics per
// engine/core/src/wasm/pathfinder.test.ts: cells[i] === 0 is walkable).
const cells = new Uint8Array(5);
const path = pf.findPath({ cells, width: 5, height: 1 }, { x: 0, y: 0 }, { x: 4, y: 0 });

assert.ok(Array.isArray(path) && path.length > 0, "findPath should return a non-empty route");
assert.deepEqual(path[0], { x: 0, y: 0 });
assert.deepEqual(path[path.length - 1], { x: 4, y: 0 });

console.log("[wasm] OK — loaded pathfinding.wasm from tarball, route:", JSON.stringify(path));
