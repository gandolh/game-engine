import type { PatchedImage } from "../render/static-patches";
import { validatePatchManifest } from "../render/static-patches";
import { resolveAssetUrl } from "./loader";

/** What `loadPatchedImage` needs from the browser; tests pass their own. */
export interface PatchedImageIo {
  fetch(url: string): Promise<Response>;
  decode(blob: Blob): Promise<ImageBitmap>;
}

const browserIo: PatchedImageIo = {
  fetch: (url) => fetch(url),
  decode: (blob) => createImageBitmap(blob),
};

/**
 * Load a painted image that the `@tool/image-patches` asset step cut into patches: read its
 * `patches.json`, then fetch each patch file only when the static layer first asks for it.
 * A patch the layer frees is closed, so decoded memory follows the view like baked patches do.
 * Hand the result to `renderer.bakeStaticImage`.
 */
export async function loadPatchedImage(
  manifestUrl: string,
  baseUrl = "/",
  io: PatchedImageIo = browserIo,
): Promise<PatchedImage> {
  const url = resolveAssetUrl(manifestUrl, baseUrl);
  const res = await io.fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch patch manifest at ${url}: ${res.status}`);
  const manifest = validatePatchManifest(await res.json());
  const dir = url.slice(0, url.lastIndexOf("/") + 1);

  const ready = new Map<number, ImageBitmap>();
  const loading = new Set<number>();
  // A patch released while its fetch was in flight is closed on arrival instead of kept.
  const released = new Set<number>();

  const start = (key: number): void => {
    const entry = manifest.patches[key];
    if (!entry) throw new Error(`patched image: no patch ${key} (the manifest has ${manifest.patches.length})`);
    loading.add(key);
    released.delete(key);
    const fileUrl = dir + entry.file;
    void io
      .fetch(fileUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch image patch at ${fileUrl}: ${r.status}`);
        return r.blob();
      })
      .then((blob) => io.decode(blob))
      .then(
        (bitmap) => {
          loading.delete(key);
          if (released.has(key)) {
            released.delete(key);
            bitmap.close();
            return;
          }
          ready.set(key, bitmap);
        },
        (err: unknown) => {
          loading.delete(key);
          console.error(err);
        },
      );
  };

  return {
    manifest,
    produce(key) {
      const bitmap = ready.get(key);
      if (bitmap) return bitmap;
      if (!loading.has(key)) start(key);
      return null;
    },
    release(key) {
      const bitmap = ready.get(key);
      if (bitmap) {
        bitmap.close();
        ready.delete(key);
      } else if (loading.has(key)) {
        released.add(key);
      }
    },
  };
}
