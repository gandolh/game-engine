import type { AtlasManifest } from "./atlas-format";

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
