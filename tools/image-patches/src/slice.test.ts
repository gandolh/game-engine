import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { EDG32_SET, validatePatchManifest } from "@engine/core/render";
import { makeSamplePng } from "./sample";
import { slicePng } from "./slice";

const hex = (d: Buffer, i: number): string =>
  `#${[d[i]!, d[i + 1]!, d[i + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

describe("slicePng", () => {
  const source = makeSamplePng(300, 200, 64);
  const { manifest, files } = slicePng(source, 128);

  it("writes a manifest the engine's loader accepts", () => {
    expect(validatePatchManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
    expect(files.map((f) => [f.file, f.png.width, f.png.height])).toEqual([
      ["patch-0-0.png", 128, 128],
      ["patch-1-0.png", 128, 128],
      ["patch-2-0.png", 44, 128],
      ["patch-0-1.png", 128, 72],
      ["patch-1-1.png", 128, 72],
      ["patch-2-1.png", 44, 72],
    ]);
  });

  it("the patches put back together are the source, pixel for pixel", () => {
    const back = new PNG({ width: 300, height: 200 });
    manifest.patches.forEach((p, i) => PNG.bitblt(files[i]!.png, back, 0, 0, p.w, p.h, p.x, p.y));
    expect(Buffer.compare(back.data, source.data)).toBe(0);
  });

  it("the sample is on EDG32 and opaque", () => {
    const colours = new Set<string>();
    for (let i = 0; i < source.data.length; i += 4) {
      colours.add(hex(source.data, i));
      expect(source.data[i + 3]).toBe(255);
    }
    for (const c of colours) expect(EDG32_SET.has(c as never), c).toBe(true);
    expect(colours.size).toBeGreaterThan(4);
  });
});
