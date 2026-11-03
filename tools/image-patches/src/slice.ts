import { PNG } from "pngjs";
import { DEFAULT_PATCH_SIZE, slicePatches } from "@engine/core/render";
import type { PatchManifest } from "@engine/core/render";

/** One cut patch: its file name (relative to the manifest) and its pixels. */
export interface PatchFile {
  readonly file: string;
  readonly png: PNG;
}

/**
 * Cut a painted image into square patches (`size` px, default 2048, which every WebGL2 device
 * accepts), row-major, edge patches cropped. Returns the `patches.json` manifest and the files.
 */
export function slicePng(source: PNG, size = DEFAULT_PATCH_SIZE): { manifest: PatchManifest; files: PatchFile[] } {
  const rects = slicePatches(source.width, source.height, size);
  const files: PatchFile[] = rects.map((r) => {
    const png = new PNG({ width: r.w, height: r.h });
    PNG.bitblt(source, png, r.x, r.y, r.w, r.h, 0, 0);
    return { file: `patch-${r.col}-${r.row}.png`, png };
  });
  const manifest: PatchManifest = {
    version: 1,
    width: source.width,
    height: source.height,
    patchSize: size,
    patches: rects.map((r, i) => ({ file: files[i]!.file, x: r.x, y: r.y, w: r.w, h: r.h })),
  };
  return { manifest, files };
}
