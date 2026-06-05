import type { AtlasManifest, AtlasIndex } from "./atlas-format";

export interface LoadedAtlasImage {
  manifest: AtlasManifest;
  bitmap: ImageBitmap;
  frameRect(frame: string): Readonly<PixelRect>;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function loadAtlasImage(manifest: AtlasManifest): Promise<LoadedAtlasImage> {
  const response = await fetch(manifest.imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch atlas image at ${manifest.imageUrl}: ${response.status}`);
  }
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  return {
    manifest,
    bitmap,
    frameRect(name: string): Readonly<PixelRect> {
      const frame = manifest.frames[name];
      if (!frame) throw new Error(`Atlas frame not found: ${name} (atlas ${manifest.id})`);
      return frame;
    },
  };
}

/**
 * Fetch /atlas/index.json and load all sheets listed in it. Returns the loaded
 * atlases keyed by sheet id. The indexUrl defaults to "/atlas/index.json".
 */
export async function loadAllAtlasSheets(
  indexUrl = "/atlas/index.json",
): Promise<Map<string, LoadedAtlasImage>> {
  const res = await fetch(indexUrl);
  if (!res.ok) throw new Error(`Failed to fetch atlas index at ${indexUrl}: ${res.status}`);
  const index = (await res.json()) as AtlasIndex;

  const atlases = await Promise.all(
    index.sheets.map(async (entry) => {
      const mRes = await fetch(entry.manifestUrl);
      if (!mRes.ok) {
        throw new Error(`Failed to fetch atlas manifest at ${entry.manifestUrl}: ${mRes.status}`);
      }
      const manifest = (await mRes.json()) as AtlasManifest;
      const atlas = await loadAtlasImage(manifest);
      return atlas;
    }),
  );

  const result = new Map<string, LoadedAtlasImage>();
  for (const atlas of atlases) {
    result.set(atlas.manifest.id, atlas);
  }
  return result;
}
