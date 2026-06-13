
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

      const mod = await import(filePath);

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

describe("deterministic PNG encode", () => {
  it("encodes the same pixels to identical PNG bytes in two runs (crops sheet)", () => {
    const cropsPngPath = join(ATLAS_OUT_DIR, "crops.png");
    buildAtlas({ force: true }); 
    expect(existsSync(cropsPngPath), "crops.png must exist after a build").toBe(true);
    const before = readFileSync(cropsPngPath);

    buildAtlas({ force: true }); 
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
    buildAtlas({ force: true });        
    const { built, cached } = buildAtlas(); 

    expect(built, "no sheets should rebuild on a no-op run").toHaveLength(0);
    expect(cached).toHaveLength(6);
  });

  it("touching one crop asset file rebuilds only the crops sheet", () => {
    buildAtlas({ force: true });        

    const cropFile = join(ASSETS_DIR, "crop/radish/seed.ts");
    const original = readFileSync(cropFile, "utf8");
    writeFileSync(cropFile, original + "\n"); 

    let result: { built: string[]; cached: string[] };
    try {
      result = buildAtlas(); 
    } finally {
      writeFileSync(cropFile, original); 
    }

    expect(result.built, "exactly the crops sheet should rebuild").toEqual(["crops"]);
    expect(result.cached, "the other 5 sheets stay cached").toHaveLength(5);

    buildAtlas({ force: true });
    expect(buildAtlas().built, "after restore + --force, a no-op run rebuilds nothing").toHaveLength(0);
  });
});
