/**
 * Community territory color mapping (chunk hollow-09a) — deterministically
 * maps a community id to one of a small FIXED ordered list of HOLLOW_PAL
 * roles, so "this ground belongs to community X" reads as a stable color
 * across ticks (a community's id never changes once assigned by
 * `CommunityRegistry`, so its color never does either). Every role below is
 * a distinct, legible hue from HOLLOW_PAL (palette purity — no raw hex
 * anywhere in this module or its callers).
 */
import { HOLLOW_PAL } from "../render/hollow-palette";

/** Fixed, ordered — index `i` is community-color slot `i`. Do not reorder
 *  (that would silently reassign every existing community's territory
 *  color); append new roles at the end if the palette ever needs more. */
export const COMMUNITY_COLOR_ROLES: readonly (keyof typeof HOLLOW_PAL)[] = [
  "blue",
  "green",
  "gold",
  "crimson",
  "plum",
  "cyan",
  "orange",
  "mauve",
];

/** Deterministic, stable HOLLOW_PAL role name for a community id — cycles
 *  through {@link COMMUNITY_COLOR_ROLES} (wraps once ids exceed its length).
 *  Pure; negative/fractional ids are defensively floored/absolute-valued so
 *  this never throws on odd input. */
export function communityColorRole(communityId: number): keyof typeof HOLLOW_PAL {
  const n = COMMUNITY_COLOR_ROLES.length;
  const idx = ((Math.floor(Math.abs(communityId)) % n) + n) % n;
  return COMMUNITY_COLOR_ROLES[idx]!;
}
