/**
 * Atlas frame-existence guard (brief 85, Tier B #6).
 *
 * `resolveFrameAndBob` constructs farmer atlas frame names by string assembly
 * (base + facing + walk/action suffix). Nothing else verifies those names are
 * actually present in the shipped `characters` sheet — a missing one fails
 * silently / draws nothing. This guard enumerates every frame the resolver can
 * emit (via the single-source `enumerateFarmerFrames`) and asserts each exists
 * in the built manifest. If a recipe or a suffix drifts, this fails loudly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { enumerateFarmerFrames } from "./frames";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "../../../farm-valley/public/atlas/characters.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { frames: Record<string, unknown> };
const frameKeys = new Set(Object.keys(manifest.frames));

// Personalities = every base "farmer/<p>" the sheet ships (self-adjusting if one is added).
const personalities = [...frameKeys]
  .map((k) => /^farmer\/([^/]+)$/.exec(k)?.[1])
  .filter((p): p is string => p !== undefined);

describe("atlas frame-existence guard (characters sheet)", () => {
  it("ships the 5 expected farmer bases (4 AI + Pip)", () => {
    expect([...personalities].sort()).toEqual([
      "aggressive",
      "conservative",
      "hoarder",
      "opportunist",
      "pip",
    ]);
  });

  it("every frame resolveFrameAndBob can emit exists in the atlas", () => {
    const missing: string[] = [];
    for (const p of personalities) {
      for (const frame of enumerateFarmerFrames(`farmer/${p}`)) {
        if (!frameKeys.has(frame)) missing.push(frame);
      }
    }
    expect(missing, `missing atlas frames:\n${missing.join("\n")}`).toEqual([]);
  });
});
