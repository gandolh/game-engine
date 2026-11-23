import type { AtlasManifest, AtlasIndex, AtlasPage, AtlasPlacement } from "./atlas-format";

/**
 * A sheet ready to draw from. Sheets packed onto one page share the page's `bitmap` object, with the
 * manifest's size the page's and every frame offset to its place there; the renderer uploads one texture per
 * bitmap, so they batch together.
 */
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

export async function loadAtlasImage(manifest: AtlasManifest, baseUrl = "/"): Promise<LoadedAtlasImage> {
  const bitmap = await fetchBitmap(manifest.imageUrl, baseUrl);
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

async function fetchBitmap(url: string, baseUrl: string): Promise<ImageBitmap> {
  const imageUrl = resolveAssetUrl(url, baseUrl);
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to fetch atlas image at ${imageUrl}: ${response.status}`);
  return createImageBitmap(await response.blob());
}

/**
 * A sheet as it sits on its page: the page's size, every frame moved by the sheet's place there, and the
 * page's image. Frame sizes and names are unchanged, so anything that looks a frame up keeps working.
 */
export function sheetOnPage(
  manifest: AtlasManifest,
  page: AtlasPage,
  placement: AtlasPlacement,
  bitmap: ImageBitmap,
): LoadedAtlasImage {
  const frames: Record<string, PixelRect> = {};
  for (const [name, f] of Object.entries(manifest.frames)) {
    frames[name] = { x: f.x + placement.x, y: f.y + placement.y, w: f.w, h: f.h };
  }
  const onPage: AtlasManifest = {
    ...manifest,
    imageUrl: page.imageUrl,
    width: page.width,
    height: page.height,
    frames,
  };
  return {
    manifest: onPage,
    bitmap,
    frameRect(name: string): Readonly<PixelRect> {
      const frame = frames[name];
      if (!frame) throw new Error(`Atlas frame not found: ${name} (atlas ${manifest.id})`);
      return frame;
    },
  };
}

async function fetchManifest(url: string, baseUrl: string): Promise<AtlasManifest> {
  const manifestUrl = resolveAssetUrl(url, baseUrl);
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`Failed to fetch atlas manifest at ${manifestUrl}: ${res.status}`);
  return (await res.json()) as AtlasManifest;
}

/**
 * Every sheet an atlas index lists, keyed by sheet id. When the index has pages (corpus brief 10), each page
 * image is fetched once and every sheet on it draws from it; otherwise each sheet's own image is fetched.
 */
export async function loadAllAtlasSheets(
  indexUrl = "/atlas/index.json",
  baseUrl = "/",
): Promise<Map<string, LoadedAtlasImage>> {
  const resolvedIndexUrl = resolveAssetUrl(indexUrl, baseUrl);
  const res = await fetch(resolvedIndexUrl);
  if (!res.ok) throw new Error(`Failed to fetch atlas index at ${resolvedIndexUrl}: ${res.status}`);
  const index = (await res.json()) as AtlasIndex;

  const { pages, placements } = index;
  if (pages !== undefined && pages.length > 0 && placements !== undefined) {
    const pageById = new Map(pages.map((p) => [p.id, p] as const));
    const bitmaps = new Map<string, Promise<ImageBitmap>>();
    for (const p of pages) bitmaps.set(p.id, fetchBitmap(p.imageUrl, baseUrl));
    const sheets = await Promise.all(
      index.sheets.map(async (entry) => {
        const placement = placements[entry.id];
        const page = placement === undefined ? undefined : pageById.get(placement.page);
        const bitmap = placement === undefined ? undefined : bitmaps.get(placement.page);
        if (placement === undefined || page === undefined || bitmap === undefined) {
          throw new Error(`Atlas index places sheet "${entry.id}" on no page it lists`);
        }
        return sheetOnPage(await fetchManifest(entry.manifestUrl, baseUrl), page, placement, await bitmap);
      }),
    );
    return new Map(sheets.map((sheet) => [sheet.manifest.id, sheet] as const));
  }

  const atlases = await Promise.all(
    index.sheets.map(async (entry) => loadAtlasImage(await fetchManifest(entry.manifestUrl, baseUrl), baseUrl)),
  );

  const result = new Map<string, LoadedAtlasImage>();
  for (const atlas of atlases) {
    result.set(atlas.manifest.id, atlas);
  }
  return result;
}
