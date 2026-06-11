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
import { execSync } from "node:child_process";
import { BASE_RECIPES } from "./index";
import { RECIPES } from "../index";

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

  it("the barrel BASE_RECIPES has 195 entries (one per asset file)", () => {
    expect(allAssetFiles).toHaveLength(195);
    expect(BASE_RECIPES).toHaveLength(195);
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
    expect(existsSync(cropsPngPath), "crops.png must exist (run atlas builder first)").toBe(true);

    const before = readFileSync(cropsPngPath);

    execSync("npx tsx src/index.ts --force", {
      cwd: ATLAS_BUILDER_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const after = readFileSync(cropsPngPath);
    expect(after.length, "crops.png size changed on --force rebuild").toBe(before.length);
    expect(
      after.equals(before),
      "crops.png is not byte-identical after --force rebuild (encoder non-determinism)",
    ).toBe(true);
  });
});

describe("per-sheet cache", () => {
  it("a second builder run (no changes) reports all 6 sheets cached", () => {
    execSync("npx tsx src/index.ts --force", {
      cwd: ATLAS_BUILDER_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const output = execSync("npx tsx src/index.ts", {
      cwd: ATLAS_BUILDER_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const builtLines = output.split("\n").filter((l) => /\[[^\]]+\] built/.test(l));
    const cachedLines = output.split("\n").filter((l) => /\[[^\]]+\] cached/.test(l));

    expect(
      builtLines,
      "no sheets should be rebuilt on a no-op run:\n" + output,
    ).toHaveLength(0);
    expect(cachedLines).toHaveLength(6);
  });

  it("touching one crop asset file rebuilds only the crops sheet", () => {
    execSync("npx tsx src/index.ts --force", {
      cwd: ATLAS_BUILDER_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    execSync("npx tsx src/index.ts", {
      cwd: ATLAS_BUILDER_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const cropFile = join(ASSETS_DIR, "crop/radish/seed.ts");
    const original = readFileSync(cropFile, "utf8");
    writeFileSync(cropFile, original + "\n");

    let output: string;
    try {
      output = execSync("npx tsx src/index.ts", {
        cwd: ATLAS_BUILDER_DIR,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } finally {
      // Always restore the original file content
      writeFileSync(cropFile, original);
    }

    const builtLines = output.split("\n").filter((l) => /\[[^\]]+\] built/.test(l));
    const cachedLines = output.split("\n").filter((l) => /\[[^\]]+\] cached/.test(l));

    expect(
      builtLines,
      "expected exactly 1 sheet to rebuild:\n" + output,
    ).toHaveLength(1);
    expect(builtLines[0], "only the crops sheet should rebuild").toMatch(/crops/);
    expect(
      cachedLines,
      "expected 5 sheets to remain cached:\n" + output,
    ).toHaveLength(5);

    execSync("npx tsx src/index.ts --force", {
      cwd: ATLAS_BUILDER_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output2 = execSync("npx tsx src/index.ts", {
      cwd: ATLAS_BUILDER_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const builtLines2 = output2.split("\n").filter((l) => /\[[^\]]+\] built/.test(l));
    expect(builtLines2, "after restoring + --force, all sheets should be cached:\n" + output2).toHaveLength(0);
  });
});
