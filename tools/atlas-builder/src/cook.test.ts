import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import type { AtlasConfig } from "./config";
import { buildAtlas } from "./cook";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** A two-recipe game with its own two-colour palette, cooked into a fresh temporary folder. */
function fixtureGame(swatchB: readonly [number, number, number, number] = [0, 0, 255, 255]): AtlasConfig {
  const dir = mkdtempSync(join(tmpdir(), "atlas-fixture-"));
  dirs.push(dir);
  const source = join(dir, "recipes.txt");
  writeFileSync(source, "v1");
  return {
    id: "fixture",
    recipes: [
      { name: "gem/red", size: 2, pixels: ["aa", "a."] },
      { name: "gem/blue", size: 3, width: 2, pixels: ["bb", ".b", "b."] },
    ],
    sheetOf: (frame) => frame.split("/")[0] ?? "",
    sheetOrder: ["gem"],
    swatches: { ".": [0, 0, 0, 0], a: [255, 0, 0, 255], b: swatchB },
    palette: { name: "fixture-2", colors: ["#ff0000", "#0000ff"] },
    hashInputs: () => [source],
    outDir: join(dir, "atlas"),
    urlBase: "/fixture-atlas/",
  };
}

describe("buildAtlas with a game's config", () => {
  it("cooks a small fixture game into its own folder, then finds it cached", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const config = fixtureGame();
    expect(buildAtlas(config)).toEqual({ built: ["gem"], cached: [], pagesBuilt: true });

    const manifest = JSON.parse(readFileSync(join(config.outDir, "gem.json"), "utf8")) as {
      imageUrl: string;
      width: number;
      height: number;
      frames: Record<string, { x: number; y: number; w: number; h: number }>;
    };
    expect(manifest.imageUrl).toBe("/fixture-atlas/gem.png");
    // Rows 1 to 3 plus a pixel of padding either side: 5, rounded up to a power of two.
    expect([manifest.width, manifest.height]).toEqual([128, 8]);
    expect(manifest.frames).toEqual({ "gem/red": { x: 1, y: 1, w: 2, h: 2 }, "gem/blue": { x: 4, y: 1, w: 2, h: 3 } });
    const index = JSON.parse(readFileSync(join(config.outDir, "index.json"), "utf8")) as unknown;
    expect(index).toMatchObject({
      sheets: [{ id: "gem", imageUrl: "/fixture-atlas/gem.png", manifestUrl: "/fixture-atlas/gem.json" }],
      pages: [{ id: "page-0", imageUrl: "/fixture-atlas/page-0.png", width: 128, height: 8 }],
      placements: { gem: { page: "page-0", x: 0, y: 0 } },
    });
    // One sheet: its page is the same pixels.
    const page = PNG.sync.read(readFileSync(join(config.outDir, "page-0.png")));
    expect(page.data.equals(PNG.sync.read(readFileSync(join(config.outDir, "gem.png"))).data)).toBe(true);

    const png = PNG.sync.read(readFileSync(join(config.outDir, "gem.png")));
    const at = (x: number, y: number) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
    expect(at(1, 1)).toEqual([255, 0, 0, 255]);
    expect(at(2, 2)).toEqual([0, 0, 0, 0]);
    expect(at(5, 2)).toEqual([0, 0, 255, 255]);

    expect(buildAtlas(config)).toEqual({ built: [], cached: ["gem"], pagesBuilt: false });
    // A new URL base cooks the sheet again, so no manifest points at the old one.
    expect(buildAtlas({ ...config, urlBase: "/elsewhere/" }).built).toEqual(["gem"]);
    expect(buildAtlas(config).built).toEqual(["gem"]);
    // A hashed input that changes cooks the sheet again.
    writeFileSync(config.hashInputs("gem", config.recipes)[0] ?? "", "v2");
    expect(buildAtlas(config).built).toEqual(["gem"]);
  });

  it("fails the cook on a swatch outside the game's palette, naming the recipe and the character", () => {
    const config = fixtureGame([1, 2, 3, 255]);
    expect(() => buildAtlas(config)).toThrow(/recipe "gem\/blue": character "b" is #010203, not in fixture-2/);
  });

  it("fails the cook on a character with no swatch", () => {
    const config = fixtureGame();
    const broken: AtlasConfig = { ...config, recipes: [{ name: "gem/odd", size: 1, pixels: ["z"] }] };
    expect(() => buildAtlas(broken)).toThrow(/recipe "gem\/odd": character "z" has no swatch/);
  });

  it("refuses an animation that names a frame the set lacks", () => {
    const config: AtlasConfig = {
      ...fixtureGame(),
      animations: [{ name: "blink", frames: ["gem/red", "gem/green"], frameDurationMs: 100, mode: "loop" }],
    };
    expect(() => buildAtlas(config)).toThrow(/animation "blink": frame "gem\/green" is not in the set/);
  });

  it("writes declared animations into the manifest, and cooks again when they change", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const blink = {
      name: "blink",
      frames: ["gem/red", "gem/blue"],
      frameDurationMs: [100, 200],
      mode: "loop",
    } as const;
    const config: AtlasConfig = { ...fixtureGame(), animations: [blink] };
    expect(buildAtlas(config).built).toEqual(["gem"]);
    const read = () => JSON.parse(readFileSync(join(config.outDir, "gem.json"), "utf8")) as { animations?: unknown };
    expect(read().animations).toEqual([blink]);
    expect(buildAtlas(config).cached).toEqual(["gem"]);
    expect(buildAtlas({ ...config, animations: [{ ...blink, mode: "once" }] }).built).toEqual(["gem"]);
  });

  it("leaves the manifest without an animations field when the set declares none", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const config = fixtureGame();
    buildAtlas(config);
    expect(JSON.parse(readFileSync(join(config.outDir, "gem.json"), "utf8"))).not.toHaveProperty("animations");
  });
});
