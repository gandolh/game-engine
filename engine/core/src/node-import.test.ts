import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

// audit-19: nothing enforced decisions.md's "the WebGL2 renderer must be imported
// DYNAMICALLY" constraint — the corpus records that this broke every Node consumer
// once already, and "typecheck plus 689 passing tests did not catch it" (both run
// under a bundler-aware resolver, which is exactly what hides the bug). This file
// drives the import through `tsx`, the same loader every real Node consumer starts
// with (`tsx src/index.ts` in all 7 tool/server start scripts) — see
// engine/core/src/node-import-check.ts for the script that gets run.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const scriptPath = path.join(here, "node-import-check.ts");
const tsxBin = path.join(repoRoot, "node_modules", ".bin", "tsx");

describe("Node-context import smoke test (audit-19)", () => {
  it("resolves @engine/core and @engine/core/render through tsx, with no bundler in the loop", () => {
    // Fail loud here rather than let spawnSync produce a cryptic ENOENT below.
    expect(
      fs.existsSync(tsxBin),
      `tsx binary not found at ${tsxBin} — every Node consumer (both game servers, ` +
        "run-sim, world-preview, citadel-sim, hollow-sim) starts via `tsx src/index.ts`; " +
        "this gate drives the same loader and needs it hoisted/installed at the repo root.",
    ).toBe(true);

    const result = spawnSync(tsxBin, [scriptPath], {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 30_000,
    });

    const ok = result.status === 0 && result.stdout.includes("NODE_IMPORT_CHECK_OK");
    if (!ok) {
      throw new Error(
        [
          "A value export pulled the WebGL2 passes into a Node consumer.",
          "",
          "@engine/core (or @engine/core/render) failed to import under `tsx` — the exact " +
            "loader every real Node consumer (both game servers, run-sim, world-preview, " +
            "citadel-sim, hollow-sim) starts with, no bundler in the loop.",
          "",
          "decisions.md -> Renderer records this failure mode: WebGl2Renderer must stay a " +
            "TYPE-ONLY export from engine/core/src/render/index.ts, and createRenderer must " +
            'keep its `await import("./webgl2/renderer")` dynamic import. The WebGL2 passes ' +
            "statically `import ... from \"*.glsl?raw\"`, which only a bundler can resolve — " +
            "a value export (or any other static export reaching webgl2/) makes Node crash " +
            "with ERR_UNKNOWN_FILE_EXTENSION on startup, even though these consumers never render.",
          "",
          `exit code: ${result.status}`,
          `signal: ${result.signal ?? "none"}`,
          `stdout:\n${result.stdout}`,
          `stderr:\n${result.stderr}`,
        ].join("\n"),
      );
    }
  });

  it("keeps every webgl2/ reference in the render barrel type-only — no .glsl module is statically reachable from @engine/core without going through createRenderer's dynamic import", () => {
    const barrelPath = path.join(here, "render", "index.ts");
    const barrelSrc = fs.readFileSync(barrelPath, "utf-8");

    const webgl2Lines = barrelSrc
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && line.includes("webgl2/"));

    // Guard against this check silently going stale if webgl2 is ever relocated/renamed
    // out from under it.
    expect(webgl2Lines.length).toBeGreaterThan(0);

    for (const line of webgl2Lines) {
      expect(
        line.trim().startsWith("export type"),
        "render/index.ts reaches into webgl2/ with a non-type-only export — this statically " +
          `pulls the WebGL2 passes (and their *.glsl?raw imports) into every Node consumer:\n${line}`,
      ).toBe(true);
    }

    const createRendererPath = path.join(here, "render", "create-renderer.ts");
    const createRendererSrc = fs.readFileSync(createRendererPath, "utf-8");
    expect(
      createRendererSrc.includes('await import("./webgl2/renderer")'),
      "createRenderer no longer dynamically imports the WebGL2 renderer — audit-19 protects " +
        "that dynamic import; see corpus/wiki/decisions.md -> Renderer",
    ).toBe(true);
  });
});
