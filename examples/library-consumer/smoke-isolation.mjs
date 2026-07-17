// Proves the fixture resolves the three packages from ITS OWN node_modules (populated from the
// tarballs) and never reaches back into the monorepo source tree at engine/core, engine/ui, or
// engine/wasm-modules.

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const localNodeModules = resolve(here, "node_modules") + sep;
// The monorepo root is three levels up from examples/library-consumer.
const monorepoEngineDir = resolve(here, "..", "..", "engine") + sep;

const specifiers = [
  "@engine/core/ecs",
  "@engine/ui/widget",
  "@engine/wasm-modules/pathfinding.wasm",
];

for (const spec of specifiers) {
  // import.meta.resolve is synchronous (unflagged) on Node >=20.6 / >=21 — this repo targets
  // Node 22, so no `await` here despite the name.
  const resolved = fileURLToPath(import.meta.resolve(spec));
  assert.ok(
    resolved.startsWith(localNodeModules),
    `${spec} should resolve under the fixture's node_modules, got: ${resolved}`,
  );
  assert.ok(
    !resolved.startsWith(monorepoEngineDir),
    `${spec} should NOT resolve into monorepo source at ${monorepoEngineDir}, got: ${resolved}`,
  );
  console.log(`[isolation] OK — ${spec} -> ${resolved}`);
}
