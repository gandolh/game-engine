// Asset smoke: proves the packed tarballs carry the non-TS runtime files that
// `tsc` does not emit — today that means @engine/core's GLSL shaders.
//
// Why this is a FILE-EXISTENCE check and not an import: the render modules pull
// their shaders in as `./shaders/x.glsl?raw`, a bundler specifier plain Node
// cannot resolve. That is exactly why smoke-ui.mjs skips the /render subpath —
// and it left a hole: @engine/core shipped for weeks with ZERO shaders, because
// postbuild.mjs still copied `*.wgsl` after WebGPU was deleted, and no smoke
// could see it (audit-36). Asserting the files are present in the installed
// package catches that regression class without dragging a bundler into a Node
// fixture.

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `./package.json` is deliberately NOT in @engine/core's exports map, so resolve
// through a subpath that IS exported and walk up to the package root.
const entry = fileURLToPath(await import.meta.resolve("@engine/core/ecs"));
let corePkgRoot = dirname(entry);
while (!existsSync(join(corePkgRoot, "package.json"))) {
  const up = dirname(corePkgRoot);
  assert.notEqual(up, corePkgRoot, "walked past the filesystem root looking for @engine/core");
  corePkgRoot = up;
}

function walk(dir, match, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, match, out);
    else if (match(name)) out.push(p);
  }
  return out;
}

function smokeShaderAssets() {
  const shaders = walk(corePkgRoot, (n) => n.endsWith(".glsl"));
  assert.ok(
    shaders.length > 0,
    "@engine/core's tarball ships no .glsl shaders — postbuild.mjs's asset copy is broken " +
      "(it once selected the long-deleted *.wgsl), so every bundler consumer of " +
      "@engine/core/render gets unresolvable ./shaders/*.glsl?raw specifiers.",
  );

  // Every `?raw` shader specifier the packed render code imports must resolve to
  // a file that is actually in the tarball — a partial copy is as broken as none.
  const js = walk(corePkgRoot, (n) => n.endsWith(".js"));
  let checked = 0;
  for (const file of js) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/from\s*["'](\.[^"']*?\.glsl)\?raw["']/g)) {
      const target = join(dirname(file), m[1]);
      assert.ok(
        statSync(target, { throwIfNoEntry: false }),
        `packed ${file.slice(corePkgRoot.length + 1)} imports ${m[1]}?raw, but that file is not in the tarball`,
      );
      checked++;
    }
  }

  console.log(
    `[core/assets] OK — ${shaders.length} .glsl shipped; ${checked} ?raw specifier(s) resolve inside the tarball`,
  );
}

smokeShaderAssets();
