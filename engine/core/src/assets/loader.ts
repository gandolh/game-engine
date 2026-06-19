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

export function resolveAssetUrl(url: string, baseUrl = "/"): string {
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}${url}`;
}

export async function loadAtlasImage(
  manifest: AtlasManifest,
  baseUrl = "/",
): Promise<LoadedAtlasImage> {
  const imageUrl = resolveAssetUrl(manifest.imageUrl, baseUrl);
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch atlas image at ${imageUrl}: ${response.status}`);
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

export async function loadAllAtlasSheets(
  indexUrl = "/atlas/index.json",
  baseUrl = "/",
): Promise<Map<string, LoadedAtlasImage>> {
  const resolvedIndexUrl = resolveAssetUrl(indexUrl, baseUrl);
  const res = await fetch(resolvedIndexUrl);
  if (!res.ok) throw new Error(`Failed to fetch atlas index at ${resolvedIndexUrl}: ${res.status}`);
  const index = (await res.json()) as AtlasIndex;

  const atlases = await Promise.all(
    index.sheets.map(async (entry) => {
      const manifestUrl = resolveAssetUrl(entry.manifestUrl, baseUrl);
      const mRes = await fetch(manifestUrl);
      if (!mRes.ok) {
        throw new Error(`Failed to fetch atlas manifest at ${manifestUrl}: ${mRes.status}`);
      }
      const manifest = (await mRes.json()) as AtlasManifest;
      const atlas = await loadAtlasImage(manifest, baseUrl);
      return atlas;
    }),
  );

  const result = new Map<string, LoadedAtlasImage>();
  for (const atlas of atlases) {
    result.set(atlas.manifest.id, atlas);
  }
  return result;
}
