/**
 * assets.test.ts — guards the per-asset recipe files.
 *
 *   1. Every asset file's path matches its recipe name.
 *   2. No two recipes have the same frame name.
 *   3. Deterministic encode: same pixels → byte-identical PNG (pinned encoder).
 *   4. Cache behavior: no-op run skips all sheets; touching one file rebuilds only its sheet.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_RECIPES } from "./index";
import { RECIPES } from "../index";
import { buildAtlas } from "../../index";

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = HERE;
const ATLAS_BUILDER_DIR = join(HERE, "../../..");
const ATLAS_OUT_DIR = join(ATLAS_BUILDER_DIR, "../../packages/farm-valley/public/atlas");

function collectAssetFiles(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "index.ts" || name.endsWith(".test.ts")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectAssetFiles(full, out);
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }
}

const allAssetFiles: string[] = [];
collectAssetFiles(ASSETS_DIR, allAssetFiles);
allAssetFiles.sort();

describe("asset file path matches recipe name", () => {
  it("every asset file default-exports a recipe whose name matches the file path", async () => {
    const mismatches: string[] = [];
    for (const filePath of allAssetFiles) {
      const rel = relative(ASSETS_DIR, filePath);
      const expectedName = rel.replace(/\.ts$/, "").replace(/\\/g, "/");
      // Dynamically import and check the default export
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const mod = await import(filePath);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const recipe = mod.default as { name?: unknown };
      if (recipe?.name !== expectedName) {
        mismatches.push(
          `${rel}: expected name="${expectedName}", got name="${String(recipe?.name)}"`,
        );
      }
    }
    expect(mismatches, "path ↔ name mismatches:\n" + mismatches.join("\n")).toHaveLength(0);
  });

  it("the barrel BASE_RECIPES has 239 entries (one per asset file)", () => {
    expect(allAssetFiles).toHaveLength(239);
    expect(BASE_RECIPES).toHaveLength(239);
  });
});

describe("no duplicate recipe names", () => {
  it("BASE_RECIPES has no duplicate names", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of BASE_RECIPES) {
      if (seen.has(r.name)) {
        dupes.push(r.name);
      }
      seen.add(r.name);
    }
    expect(dupes, "duplicate names: " + dupes.join(", ")).toHaveLength(0);
  });

  it("full RECIPES array has no duplicate names", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of RECIPES) {
      if (seen.has(r.name)) {
        dupes.push(r.name);
      }
      seen.add(r.name);
    }
    expect(dupes, "duplicate names: " + dupes.join(", ")).toHaveLength(0);
  });
});

// These drive the builder IN-PROCESS via buildAtlas() (no `tsx` subprocess per case — ~8 process
// spawns became fast function calls, fixing the constrained-hardware timeout). The cache is still
// filesystem-based (computeSheetHash hashes asset file CONTENTS read fresh from disk), so the
// touch-a-file test exercises real incremental behavior even in-process.
describe("deterministic PNG encode", () => {
  it("encodes the same pixels to identical PNG bytes in two runs (crops sheet)", () => {
    const cropsPngPath = join(ATLAS_OUT_DIR, "crops.png");
    buildAtlas({ force: true }); // baseline
    expect(existsSync(cropsPngPath), "crops.png must exist after a build").toBe(true);
    const before = readFileSync(cropsPngPath);

    buildAtlas({ force: true }); // rebuild
    const after = readFileSync(cropsPngPath);

    expect(after.length, "crops.png size changed on --force rebuild").toBe(before.length);
    expect(
      after.equals(before),
      "crops.png is not byte-identical after a --force rebuild (encoder non-determinism)",
    ).toBe(true);
  });
});

describe("per-sheet cache", () => {
  it("a second build (no changes) reports all 6 sheets cached", () => {
    buildAtlas({ force: true });        // warm every sheet
    const { built, cached } = buildAtlas(); // no-op incremental run

    expect(built, "no sheets should rebuild on a no-op run").toHaveLength(0);
    expect(cached).toHaveLength(6);
  });

  it("touching one crop asset file rebuilds only the crops sheet", () => {
    buildAtlas({ force: true });        // warm every sheet

    const cropFile = join(ASSETS_DIR, "crop/radish/seed.ts");
    const original = readFileSync(cropFile, "utf8");
    writeFileSync(cropFile, original + "\n"); // content change → crops hash changes

    let result: { built: string[]; cached: string[] };
    try {
      result = buildAtlas(); // incremental: only the crops sheet's hash moved
    } finally {
      writeFileSync(cropFile, original); // always restore
    }

    expect(result.built, "exactly the crops sheet should rebuild").toEqual(["crops"]);
    expect(result.cached, "the other 5 sheets stay cached").toHaveLength(5);

    // Reset: the rebuilt manifest now holds the touched-content hash; a --force restores the
    // restored-content hash so a later no-op run is clean.
    buildAtlas({ force: true });
    expect(buildAtlas().built, "after restore + --force, a no-op run rebuilds nothing").toHaveLength(0);
  });
});
