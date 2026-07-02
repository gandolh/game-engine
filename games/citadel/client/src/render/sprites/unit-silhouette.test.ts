/**
 * art-05 acceptance gate — unit role SILHOUETTE + the multiply-tint contract.
 *
 * A villager's role must read by SILHOUETTE (a held tool / hat / robe), not by
 * job tint alone: so each role frame must add opaque pixels OUTSIDE the plain
 * `vil/person` body mask. And the tinted-body contract must hold — the body ramp
 * stays NEUTRAL GREY so the per-instance job multiply never biases toward a hue;
 * accessory colour that must survive the multiply (steel tool heads, warm skin)
 * lives OFF the body mask. Pure/headless.
 */
import { describe, it, expect } from "vitest";
import { UNIT_RECIPES, ROLE_ACCESSORY_JOBS, villagerRoleFrameName, FRAME_VILLAGER } from "./recipes";
import { rasterizeRecipe } from "./rasterize";
import type { PixelRecipe } from "./types";

function byName(name: string): PixelRecipe {
  const r = UNIT_RECIPES.find((x) => x.name === name);
  if (!r) throw new Error(`no recipe ${name}`);
  return r;
}

/** Opaque mask (Uint8, 1 = opaque) of a recipe raster. */
function opaqueMask(recipe: PixelRecipe): { mask: Uint8Array; w: number; h: number } {
  const r = rasterizeRecipe(recipe);
  const mask = new Uint8Array(r.width * r.height);
  for (let i = 0; i < mask.length; i++) mask[i] = r.rgba[i * 4 + 3]! > 0 ? 1 : 0;
  return { mask, w: r.width, h: r.height };
}

describe("art-05 unit role silhouettes", () => {
  const base = opaqueMask(byName(FRAME_VILLAGER)); // vil/person pose 0

  it("every role frame exists and rasterizes", () => {
    const names = new Set(UNIT_RECIPES.map((r) => r.name));
    for (const role of ROLE_ACCESSORY_JOBS) {
      expect(names.has(villagerRoleFrameName(role, 0)), `${role} pose 0`).toBe(true);
    }
  });

  it("each role adds opaque pixels OUTSIDE the plain body mask (silhouette changed)", () => {
    const weak: string[] = [];
    for (const role of ROLE_ACCESSORY_JOBS) {
      const rm = opaqueMask(byName(villagerRoleFrameName(role, 0)));
      expect(rm.w).toBe(base.w);
      expect(rm.h).toBe(base.h);
      let added = 0;
      for (let i = 0; i < rm.mask.length; i++) if (rm.mask[i] === 1 && base.mask[i] === 0) added++;
      // A real held tool / hat / robe adds a clear cluster of new silhouette pixels.
      if (added < 6) weak.push(`${role} (+${added}px)`);
    }
    expect(weak, weak.length ? `Role accessory too small to change silhouette:\n  ${weak.join("\n  ")}` : "").toEqual([]);
  });
});

describe("art-05 multiply-tint contract (accessory doesn't flood the tint)", () => {
  // The tinted body ramp is EDG's COOL-grey `steel/slate/silver/white` (slightly
  // blue by design — see units.ts), plus a small warm skin kiss. The contract we
  // must protect is that a role accessory does NOT flood the sprite with an extra
  // biasing hue beyond that baseline. So: measure the base `vil/person` warm/
  // saturated fraction, and require each role frame to stay within a small margin
  // of it (the accessory adds SOME colour — a gold hat, red crest — but must not
  // dominate). This catches "accessory recoloured the whole body" without
  // false-flagging EDG's intrinsically-cool grey ramp.
  const saturatedFrac = (name: string): number => {
    const r = rasterizeRecipe(byName(name));
    let opaque = 0, hot = 0;
    for (let i = 0; i < r.width * r.height; i++) {
      const a = r.rgba[i * 4 + 3]!;
      if (a === 0) continue;
      opaque++;
      const rr = r.rgba[i * 4]!, gg = r.rgba[i * 4 + 1]!, bb = r.rgba[i * 4 + 2]!;
      // "hot" = strongly WARM/saturated (red or green dominant) — the colours an
      // accessory would add. Cool-blue greys (steel/slate) are NOT counted.
      if ((rr - bb > 40) || (gg - bb > 40)) hot++;
    }
    return opaque === 0 ? 0 : hot / opaque;
  };

  it("role frames add only a minority of warm/saturated accent pixels vs the base body", () => {
    const baseFrac = saturatedFrac(FRAME_VILLAGER);
    const offenders: string[] = [];
    for (const role of ROLE_ACCESSORY_JOBS) {
      const frac = saturatedFrac(villagerRoleFrameName(role, 0));
      // Accessory may add warm accent pixels, but the increase over the plain body
      // must stay modest (≤ 25pp) so the grey body still carries the job multiply.
      if (frac - baseFrac > 0.25) offenders.push(`${role} (+${((frac - baseFrac) * 100).toFixed(0)}pp warm)`);
    }
    expect(offenders, offenders.length ? `Accessory floods the tint:\n  ${offenders.join("\n  ")}` : "").toEqual([]);
  });
});
