/**
 * The world material table (chunk hollow-09a) — built ONCE from HOLLOW_PAL
 * roles (palette purity: every color here resolves from a `HOLLOW_PAL.*`
 * role, never a raw hex literal) and uploaded via `SceneRenderer3D.
 * setMaterials`. `WORLD_MATERIAL_KEYS` is the ordered key list every
 * `uploadMesh` call in this app must resolve `Tri.material` strings against
 * (via `worldMaterialIndexOf`, built with the engine's `materialIndexMap`)
 * — see `webgpu/buffers.ts`'s header for the index-ordering contract this
 * app must not break.
 *
 * SEAM for chunk hollow-09b: agent humanoids will need their own material
 * keys (skin/hair/clothing tones). Reuse this same ordered-list + `setMaterials`
 * + `materialIndexMap` idiom — either append agent keys to a copy of
 * `WORLD_MATERIAL_KEYS` before the app's single `setMaterials`/
 * `materialIndexMap` call (see `app.ts`'s bootstrap, clearly marked), or
 * build a second ordered list and a second `uploadMesh`/`materialIndexOf`
 * pair. Do NOT reuse `worldMaterialIndexOf` for a key it doesn't know about
 * (it throws by design — see `materialIndexMap`'s doc).
 *
 * Community territory tint strategy: rather than pre-baking one material per
 * community-color slot, there is a SINGLE neutral-white `"territoryTile"`
 * material; the actual per-community color is applied as a per-INSTANCE
 * tint multiplier (`packInstance`'s `tint` argument — see `renderer3d.ts`),
 * the same mechanism the render3d-demo uses for its picked-instance
 * highlight. This means every community's territory reuses the SAME
 * uploaded tile mesh + material (one `uploadMesh` call, ever), so a
 * community's territory changing shape (COMMUNITY system's periodic
 * split/merge/grow pass) only repacks the INSTANCE buffer next frame — it
 * never re-uploads GPU mesh geometry (which `SceneRenderer3D` has no
 * "free"/replace API for; re-uploading per territory-change would leak
 * buffers over a long play session).
 */
import { rgbOf } from "@engine/core/render";
import { materialIndexMap, type Material, type Vec3 } from "@engine/core/render3d";
import { HOLLOW_PAL } from "../render/hollow-palette";
import { communityColorRole } from "./community-color";

/** Convert a HOLLOW_PAL hex role value to the 0..1 float RGB the engine's
 *  generic `Material.color` expects. Exported for `app.ts`'s own
 *  non-material color needs (e.g. the renderer's clear color). */
export function toFloatRgb(hex: string): Vec3 {
  const [r, g, b] = rgbOf(hex);
  return [r / 255, g / 255, b / 255];
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const GRASS_RGB = toFloatRgb(HOLLOW_PAL.green);

/** How strongly a community's territory tint shows through the grass —
 *  kept low so it reads as "soft", per the brief. */
const TERRITORY_TINT_MIX = 0.4;

/** Ground/building/prop material keys used by this brief's world geometry
 *  (ground, houses, windows, resource nodes, the territory-tint tile).
 *  Agent-only keys (skin/hair) are chunk hollow-09b's addition — see this
 *  module's header seam note.
 *
 *  `"hearthFire"` (chunk hollow-14d) is the hearth's glowing flame material —
 *  EMISSIVE, same mechanism as `"window"` — see `hearth-mesh.ts`'s header;
 *  the hearth's stone base reuses the existing non-emissive `"rock"` key
 *  rather than adding a second new key.
 *
 *  `"headstone"` and `"corpseShroud"` (chunk hollow-15) are this chunk's two
 *  new non-emissive keys — see `graveyard-mesh.ts`/`corpse-mesh.ts`'s
 *  headers. The graveyard's perimeter fence reuses the existing `"woodDark"`
 *  key rather than adding a third. */
export const WORLD_MATERIAL_KEYS = [
  "grass",
  "wood",
  "woodDark",
  "roof",
  "window",
  "cropLeaf",
  "cropFruit",
  "rock",
  "territoryTile",
  "hearthFire",
  "headstone",
  "corpseShroud",
] as const;

export type WorldMaterialKey = (typeof WORLD_MATERIAL_KEYS)[number];

const WORLD_MATERIALS: Readonly<Record<WorldMaterialKey, Material>> = {
  grass: { color: GRASS_RGB },
  wood: { color: toFloatRgb(HOLLOW_PAL.wood) },
  woodDark: { color: toFloatRgb(HOLLOW_PAL.woodDark) },
  roof: { color: toFloatRgb(HOLLOW_PAL.rust) },
  window: { color: toFloatRgb(HOLLOW_PAL.gold), emissive: true },
  cropLeaf: { color: toFloatRgb(HOLLOW_PAL.greenMid) },
  cropFruit: { color: toFloatRgb(HOLLOW_PAL.salmon) },
  rock: { color: toFloatRgb(HOLLOW_PAL.slate) },
  // Neutral white — recolored per-instance by `territoryTintColor` below.
  territoryTile: { color: [1, 1, 1] },
  // The hearth's flame cluster (hearth-mesh.ts) — warm + emissive so it
  // glows on its own, distinct from `window`'s gold glow (a communal fire
  // reads differently from a lit window).
  hearthFire: { color: toFloatRgb(HOLLOW_PAL.orange), emissive: true },
  // The graveyard's headstones (graveyard-mesh.ts) — a pale stone role,
  // distinct from the hearth's darker `"rock"` base so a headstone reads as
  // its own kind of stone rather than reused rubble.
  headstone: { color: toFloatRgb(HOLLOW_PAL.silver) },
  // A corpse's shroud (corpse-mesh.ts) — a pale cloth role. Reads as a
  // normal shrouded body under the default `WHITE_TINT`; a rotting corpse
  // recolors this SAME material per-instance via `corpseTint`/`disease-tint.
  // ts`'s `sicklyTint`, same "neutral material + per-instance tint" idiom
  // `"territoryTile"` above already establishes.
  corpseShroud: { color: toFloatRgb(HOLLOW_PAL.cream) },
};

/** The `Material[]` to pass to `SceneRenderer3D.setMaterials`, in the SAME
 *  order as `WORLD_MATERIAL_KEYS`. */
export function buildWorldMaterialList(): Material[] {
  return WORLD_MATERIAL_KEYS.map((k) => WORLD_MATERIALS[k]);
}

/** `(materialKey) => index` resolver for `uploadMesh`, built from
 *  {@link WORLD_MATERIAL_KEYS} — the SAME array `buildWorldMaterialList`
 *  iterates, so index `i` always lines up with `Material[i]`. */
export const worldMaterialIndexOf: (key: string) => number = materialIndexMap(WORLD_MATERIAL_KEYS);

/** Opaque white tint (a no-op multiplier) — pass this for any instance that
 *  should render its material's own color unmodified (houses, nodes). */
export const WHITE_TINT: readonly [number, number, number, number] = [1, 1, 1, 1];

/** The per-instance tint color for a community's territory-tile instances —
 *  a soft blend of grass toward that community's `communityColorRole`.
 *  Since the `"territoryTile"` material itself is neutral white, this tint
 *  IS the tile's final color (see this module's header). */
export function territoryTintColor(communityId: number): readonly [number, number, number, number] {
  const role = communityColorRole(communityId);
  const [r, g, b] = mix(GRASS_RGB, toFloatRgb(HOLLOW_PAL[role]), TERRITORY_TINT_MIX);
  return [r, g, b, 1];
}
