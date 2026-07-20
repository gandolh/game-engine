/**
 * The picked-agent highlight (chunk hollow-09c) — the SEAM hollow-09b left
 * at the agent instance-tint site (`app.ts`'s agent draw loop, right next
 * to `humanoidTint(agent.id)`). Same MECHANISM `render3d-demo.ts`'s
 * `PICKED_TINT` uses (a per-instance RGBA multiplier, no extra material/mesh
 * needed), but the multiplier itself is derived from a `HOLLOW_PAL` role
 * (palette purity — CLAUDE.md) rather than a bare literal like the demo's:
 * `HOLLOW_PAL.gold` converted to floats and boosted, so the highlight reads
 * as "this agent is glowing gold-bright", not an arbitrary tint.
 */
import { HOLLOW_PAL } from "../render/hollow-palette";
import { toFloatRgb } from "./materials";

const GOLD_RGB = toFloatRgb(HOLLOW_PAL.gold);

/** How much brighter than the gold swatch itself the highlight multiplier
 *  goes — keeps the picked agent visibly brighter than its own base
 *  material, not merely gold-tinted-and-darker. */
const HIGHLIGHT_BOOST = 1.8;

/**
 * Multiply `baseTint` (e.g. `humanoidTint(agentId)`) by a gold-role
 * brightening factor, for the currently-selected agent's instance tint.
 * Pure; alpha passes through unchanged.
 */
export function selectedTint(
  baseTint: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  return [
    baseTint[0] * GOLD_RGB[0] * HIGHLIGHT_BOOST,
    baseTint[1] * GOLD_RGB[1] * HIGHLIGHT_BOOST,
    baseTint[2] * GOLD_RGB[2] * HIGHLIGHT_BOOST,
    baseTint[3],
  ];
}
