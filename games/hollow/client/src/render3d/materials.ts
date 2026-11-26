/**
 * The world material table (chunk hollow-09a) — built ONCE from HOLLOW_PAL
 * roles (palette purity: every color here resolves from a `HOLLOW_PAL.*`
 * role, never a raw hex literal) and uploaded via `SceneRenderer3D.
 * setMaterials`. `WORLD_MATERIAL_KEYS` is the ordered key list every
 * `uploadMesh` call in this app must resolve `Tri.material` strings against
 * (via `worldMaterialIndexOf`, built with the engine's `materialIndexMap`)
 * — see `webgl2/gl-buffers.ts`'s header for the index-ordering contract this
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
 * Community territory colours (corpus brief 31): one material per community
 * colour slot, `TERRITORY_MATERIAL_KEYS`, appended after the other world keys.
 * Each one's colour is the soft blend of grass toward that slot's
 * `COMMUNITY_COLOR_ROLES` role (`territoryTintColor`). Until brief 31 the
 * colour was a per-instance tint over one neutral white tile material; the
 * territory tiles are now merged into one mesh drawn as a single white
 * instance (`static-draws.ts`), so the colour has to come from the material.
 * The fragment shader multiplies the lit material colour by the tint, so a
 * white material under a coloured tint and a coloured material under a white
 * tint give the same pixels. A territory change rebuilds that merged mesh and
 * frees the old one with `SceneRenderer3D.releaseMesh`.
 */
import { rgbOf } from "@engine/core/render";
import { materialIndexMap, type Material, type Vec3 } from "@engine/core/render3d";
import { HOLLOW_PAL } from "../render/hollow-palette";
import { COMMUNITY_COLOR_ROLES, communityColorRole } from "./community-color";

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
 *  (ground, houses, windows, resource nodes). The territory keys follow them
 *  in {@link WORLD_MATERIAL_KEYS}. Agent-only keys (skin/hair) are chunk
 *  hollow-09b's addition — see this module's header seam note.
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
const BASE_WORLD_MATERIAL_KEYS = [
  "grass",
  "wood",
  "woodDark",
  "roof",
  "window",
  "cropLeaf",
  "cropFruit",
  "rock",
  "hearthFire",
  "headstone",
  "corpseShroud",
] as const;

type BaseWorldMaterialKey = (typeof BASE_WORLD_MATERIAL_KEYS)[number];

/** One territory material per community colour slot, in `COMMUNITY_COLOR_ROLES` order (corpus brief 31). */
export const TERRITORY_MATERIAL_KEYS: readonly string[] = COMMUNITY_COLOR_ROLES.map((role) => `territory.${role}`);

/** Every world material key, in upload order: the base keys, then the territory keys. */
export const WORLD_MATERIAL_KEYS: readonly string[] = [...BASE_WORLD_MATERIAL_KEYS, ...TERRITORY_MATERIAL_KEYS];

const WORLD_MATERIALS: Readonly<Record<BaseWorldMaterialKey, Material>> = {
  grass: { color: GRASS_RGB },
  wood: { color: toFloatRgb(HOLLOW_PAL.wood) },
  woodDark: { color: toFloatRgb(HOLLOW_PAL.woodDark) },
  roof: { color: toFloatRgb(HOLLOW_PAL.rust) },
  window: { color: toFloatRgb(HOLLOW_PAL.gold), emissive: true },
  cropLeaf: { color: toFloatRgb(HOLLOW_PAL.greenMid) },
  cropFruit: { color: toFloatRgb(HOLLOW_PAL.salmon) },
  rock: { color: toFloatRgb(HOLLOW_PAL.slate) },
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
  // ts`'s `sicklyTint`, a "neutral material + per-instance tint" idiom.
  corpseShroud: { color: toFloatRgb(HOLLOW_PAL.cream) },
};

/** The `Material[]` to pass to `SceneRenderer3D.setMaterials`, in the SAME
 *  order as `WORLD_MATERIAL_KEYS`: the base materials, then one territory
 *  material per colour slot, coloured as {@link territoryTintColor} colours
 *  that slot. */
export function buildWorldMaterialList(): Material[] {
  const base = BASE_WORLD_MATERIAL_KEYS.map((k) => WORLD_MATERIALS[k]);
  const territory = COMMUNITY_COLOR_ROLES.map((_, slot): Material => {
    const [r, g, b] = territoryTintColor(slot);
    return { color: [r, g, b] };
  });
  return [...base, ...territory];
}

/** `(materialKey) => index` resolver for `uploadMesh`, built from
 *  {@link WORLD_MATERIAL_KEYS} — the SAME array `buildWorldMaterialList`
 *  iterates, so index `i` always lines up with `Material[i]`. */
export const worldMaterialIndexOf: (key: string) => number = materialIndexMap(WORLD_MATERIAL_KEYS);

/** Opaque white tint (a no-op multiplier) — pass this for any instance that
 *  should render its material's own color unmodified (houses, nodes). */
export const WHITE_TINT: readonly [number, number, number, number] = [1, 1, 1, 1];

/** A community's territory colour — a soft blend of grass toward that
 *  community's `communityColorRole` — as opaque rgba. The territory materials
 *  take their rgb from it (see this module's header). */
export function territoryTintColor(communityId: number): readonly [number, number, number, number] {
  const role = communityColorRole(communityId);
  const [r, g, b] = mix(GRASS_RGB, toFloatRgb(HOLLOW_PAL[role]), TERRITORY_TINT_MIX);
  return [r, g, b, 1];
}

/** The material key a community's territory tiles are built with: its colour slot's entry in
 *  {@link TERRITORY_MATERIAL_KEYS}. */
export function territoryMaterialKey(communityId: number): string {
  return `territory.${communityColorRole(communityId)}`;
}
