// Invoked as a standalone `tsx` process by `node-import.test.ts` (audit-19) — do NOT
// import this file from index.ts or any barrel; it exists to be run through the exact
// loader every real Node consumer starts with (`tsx`), with no bundler in the loop, so
// it fails the same way they would if the render barrel's WebGL2 export is ever turned
// from a type-only export into a value export. See corpus/wiki/decisions.md → Renderer.
import * as core from "@engine/core";
import * as render from "@engine/core/render";

// Reference a value from each barrel so nothing here is dead code a bundler could
// tree-shake before Node ever has to resolve the import graph.
if (typeof core.createRenderer !== "function") {
  throw new Error("node-import-check: @engine/core did not resolve createRenderer");
}
if (typeof render.createRenderer !== "function") {
  throw new Error("node-import-check: @engine/core/render did not resolve createRenderer");
}

// eslint-disable-next-line no-console -- deliberate: the parent test greps stdout for this
console.log("NODE_IMPORT_CHECK_OK");
