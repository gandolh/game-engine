import type { AtlasManifest, AtlasFrame } from "./atlas-format";

export interface LoadedAtlas {
  manifest: AtlasManifest;
  texture: GPUTexture;
  view: GPUTextureView;
  frameUv(frame: string): NormalizedRect;
}

export interface LoadedAtlasImage {
  manifest: AtlasManifest;
  bitmap: ImageBitmap;
  frameRect(frame: string): PixelRect;
}

export interface NormalizedRect {
  u: number;
  v: number;
  w: number;
  h: number;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function loadAtlas(
  device: GPUDevice,
  manifest: AtlasManifest,
): Promise<LoadedAtlas> {
  const response = await fetch(manifest.imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch atlas image at ${manifest.imageUrl}: ${response.status}`);
  }
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "premultiply" });

  const texture = device.createTexture({
    size: { width: bitmap.width, height: bitmap.height },
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: bitmap, flipY: false },
    { texture },
    { width: bitmap.width, height: bitmap.height },
  );
  bitmap.close();

  const view = texture.createView();
  const invW = 1 / manifest.width;
  const invH = 1 / manifest.height;

  return {
    manifest,
    texture,
    view,
    frameUv(name: string): NormalizedRect {
      const frame = manifest.frames[name];
      if (!frame) throw new Error(`Atlas frame not found: ${name} (atlas ${manifest.id})`);
      return uvOf(frame, invW, invH);
    },
  };
}

function uvOf(frame: AtlasFrame, invW: number, invH: number): NormalizedRect {
  return {
    u: frame.x * invW,
    v: frame.y * invH,
    w: frame.w * invW,
    h: frame.h * invH,
  };
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
    frameRect(name: string): PixelRect {
      const frame = manifest.frames[name];
      if (!frame) throw new Error(`Atlas frame not found: ${name} (atlas ${manifest.id})`);
      return { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
    },
  };
}
