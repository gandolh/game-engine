/**
 * RENDER-ONLY agent de-overlap (adopts the engine's generic
 * `@engine/core/collision` module — see its header for the algorithm +
 * determinism argument). The sim steps agents on an integer tile grid
 * (`gx`/`gy` via `stepToward`) with nothing stopping two agents from landing
 * on the SAME tile, so without this they'd render on top of each other.
 *
 * This module only ever adjusts where agents are DRAWN. Its output is never
 * read back by the sim, the worker, or any snapshot field — the sim's
 * `gx`/`gy` (and therefore every downstream sim decision) stays exactly as
 * it would be with no collision system at all. Byte-determinism is
 * unaffected (see CLAUDE.md's sim/render boundary + "determinism is
 * load-bearing").
 */
import { separateCircles } from "@engine/core/collision";
import type { InterpPos } from "./interp";

/** Per-agent collision radius, in grid (tile) units — roughly half a tile,
 *  so two agents standing on ADJACENT tiles (one grid unit apart) just
 *  touch (radius + radius === 1 tile), and two agents forced onto the SAME
 *  tile (the actual bug) get pushed the rest of the way apart. */
export const AGENT_COLLISION_RADIUS = 0.5;

/**
 * Pure: run the engine's deterministic circle-separation solver over every
 * alive agent's interpolated render position, using a fixed per-agent
 * `radius`, and return the adjusted positions keyed by agent id. Agents not
 * overlapping anyone are left ~unchanged (see `separateCircles`'s doc).
 */
export function separatedAgentPositions(
  agentPositions: ReadonlyMap<number, InterpPos>,
  radius: number = AGENT_COLLISION_RADIUS,
): Map<number, InterpPos> {
  const bodies = Array.from(agentPositions, ([id, pos]) => ({
    id,
    x: pos.x,
    y: pos.y,
    radius,
  }));
  return separateCircles(bodies);
}
