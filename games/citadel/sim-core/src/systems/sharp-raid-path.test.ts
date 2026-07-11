/**
 * The SHARP raid path, end to end, through the gates a real player walks.
 *
 * ## Why this file exists
 *
 * The sharp (`cozyThreats:false`) raid resolution — `resolveSiege`'s
 * repelled/damage/sacked bands — is the path Challenge mode (brief 103) is built on
 * and the one brief 113 rehomes the marching machinery onto. It was already
 * "covered":
 *
 *   - `phase4.test.ts`   → "an undefended keep is eventually sacked → gameOver"
 *   - `cozy-threats.test.ts` → "an undefended keep is still sacked with cozyThreats:false"
 *
 * Both pass. Both have ALWAYS passed. And yet for ten days the only fixture that drove
 * the sharp path end to end (`SCENARIO=sack`) silently stopped sacking, and nobody
 * noticed — because **both of those tests poke `lp.tier = "Town"` directly before
 * placing the keep.** They prove the raid RESOLUTION works once a keep exists. They say
 * nothing at all about whether a keep can ever *come* to exist. When `TIER_LOCK.keep`
 * turned out to make the keep unplaceable in the fixture's actual circumstances, both
 * guards stayed a happy green.
 *
 * That is the same class of trap the byte-identity regression guard falls into: it proves
 * the sharp path is UNCHANGED, not that it WORKS. This file closes the gap from the other
 * side — it never touches `tier`, and it fails if any link in the real chain breaks:
 *
 *     grow → EARN Town → keep clears TIER_LOCK → raid clock anchors → raider marches
 *     → resolveSiege → sacked → gameOver
 *
 * If this file goes red, the sharp raid path is not reachable by a player, whatever the
 * other two tests say. Do not sign off raid work on top of a red run here.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { localPlayer } from "../sim-state";
import { isWalkable } from "../world/terrain";
import type { TerrainGrid } from "../world/terrain";
import { tierAtLeast, TIER_LOCK } from "./tiers";
import type { CitadelCommand } from "../snapshot/index";

const SEED = 0x1a2b3c4d; // the `sack` fixture's seed — this test mirrors that playthrough
const TICKS_PER_DAY = 20;

/** Column pitch: an in-row wooden neighbour lands at Manhattan 4 → inside the fire rule's window. */
const COL_PITCH = 4;
/** Row pitch: a cross-row neighbour lands at Manhattan 5 → OUTSIDE it. */
const ROW_PITCH = 5;

/**
 * The town, row-major — a deliberately FIRE-SAFE lattice (the same one
 * `tools/citadel-sim` lays for `SCENARIO=sack`).
 *
 * `FireSystem._checkIgnition` only ignites a wooden building with ≥3 other wooden
 * buildings within Manhattan 4 of its centre. On this pitch every wooden building has at
 * most 2, so spontaneous ignition is structurally impossible — which matters because the
 * sharp path also un-gates sharp FIRE (buildings are DESTROYED, not smouldered), and a
 * town that burns its own houses down never reaches the population Town tier needs.
 *
 * 20 structures ≥ 15 (Town's buildings path) and 6 houses → popCap 36, so growth is gated
 * by food, not housing. `well`/`healer` are not wooden — free real estate on the lattice.
 */
const LATTICE: ReadonlyArray<ReadonlyArray<string>> = [
  ["mill",   "farm",       "farm",   "mill"],
  ["bakery", "storehouse", "well",   "bakery"],
  ["chapel", "house",      "house",  "market"],
  ["house",  "watchpost",  "healer", "house"],
  ["well",   "house",      "house",  "chapel"],
];

const FOOTPRINTS: Readonly<Record<string, { w: number; h: number }>> = {
  house: { w: 2, h: 2 },
  farm: { w: 3, h: 3 },
  mill: { w: 2, h: 2 },
  bakery: { w: 2, h: 2 },
  storehouse: { w: 3, h: 2 },
  chapel: { w: 2, h: 2 },
  market: { w: 2, h: 2 },
  watchpost: { w: 2, h: 2 },
  well: { w: 1, h: 1 },
  healer: { w: 2, h: 2 },
};

/** Top-left of a clear (walkable) w×h region near (sx, sy). */
function findClear(terrain: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++) {
          for (let xx = 0; xx < w; xx++) {
            if (!isWalkable(terrain, x + xx, y + yy)) { ok = false; break; }
          }
        }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

/** Lay the town; return its commands and the site the keep will occupy LATER (on tier-up). */
function layTown(terrain: TerrainGrid): { cmds: CitadelCommand[]; keep: { x: number; y: number } } {
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);
  const region = findClear(terrain, 17, 31, cx - 8, cy - 15);
  const X = region.x + 1;
  const Y = region.y + 1;

  const cmds: CitadelCommand[] = [];
  const footprint = new Set<number>();
  for (let row = 0; row < LATTICE.length; row++) {
    const slots = LATTICE[row]!;
    for (let col = 0; col < slots.length; col++) {
      const type = slots[col]!;
      const x = X + col * COL_PITCH;
      const y = Y + row * ROW_PITCH;
      cmds.push({ type: "placeBuilding", payload: { buildingType: type, x, y } });
      const size = FOOTPRINTS[type] ?? { w: 2, h: 2 };
      for (let dy = 0; dy < size.h; dy++) {
        for (let dx = 0; dx < size.w; dx++) footprint.add((y + dy) * terrain.width + (x + dx));
      }
    }
  }

  const keep = { x: X + 4, y: Y + 25 };

  // Road carpet over the lattice's gaps (connectivity + firebreaks), plus a spine and a
  // ring reaching the keep's site — stopping one tile short of its footprint, which must
  // stay clear until the settlement earns the right to build there.
  const roadTiles: Array<{ x: number; y: number }> = [];
  const push = (x: number, y: number): void => {
    if (!isWalkable(terrain, x, y)) return;
    if (footprint.has(y * terrain.width + x)) return;
    roadTiles.push({ x, y });
  };
  const townBottom = Y + (LATTICE.length - 1) * ROW_PITCH + 2;
  for (let y = Y - 1; y <= townBottom + 1; y++) {
    for (let x = X - 1; x <= X + 3 * COL_PITCH + 2; x++) push(x, y);
  }
  for (let y = townBottom + 2; y < keep.y; y++) push(keep.x + 1, y);
  for (let y = keep.y - 1; y <= keep.y + 3; y++) {
    for (let x = keep.x - 1; x <= keep.x + 3; x++) {
      if (x >= keep.x && x < keep.x + 3 && y >= keep.y && y < keep.y + 3) continue;
      push(x, y);
    }
  }
  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return { cmds, keep };
}

describe("the sharp raid path is REACHABLE, not just unchanged", () => {
  it("TIER_LOCK gates the keep behind Town — a Hamlet's keep command is rejected", () => {
    // The mechanism that broke `SCENARIO=sack`: it issued a keep placement on day 0, at
    // Hamlet, and the command was thrown away. Raids are gated entirely on `keepPosition`
    // (raid-spawn.ts), so no keep meant no raid clock, no threat, no raiders — a fixture
    // that could not possibly sack, quietly reporting a healthy town for ten days.
    expect(TIER_LOCK["keep"]).toBe("Town");

    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, cozyThreats: false });
    const lp = localPlayer(sim.state);
    expect(lp.tier).toBe("Hamlet");

    const g = findClear(sim.terrain, 3, 3, 96, 96);
    sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: g.x, y: g.y } });
    sim.scheduler.tick({ tick: 0 });

    // Rejected — and NOT silently: the run says so. (Kept in the assertion because the
    // old fixture's only symptom was this one line, which nobody read.)
    expect(lp.keepPosition).toBeNull();
    expect(sim.state.events.some((e) => /keep needs Town tier/i.test(e))).toBe(true);
  });

  it("grow → earn Town → raise a keep → escalating raids SACK it (cozyThreats:false)", () => {
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, cozyThreats: false });
    const lp = localPlayer(sim.state);
    // NOTE: `lp.tier` is deliberately NEVER assigned in this test. The other two sharp-sack
    // guards do (`lp.tier = "Town"`), and that is exactly why they could not catch this.

    const { cmds, keep } = layTown(sim.terrain);
    for (const c of cmds) sim.commands.enqueue(c);

    let townDay = -1;
    let keepOrdered = false;
    let sackedDay = -1;

    const MAX_DAYS = 80;
    for (let tick = 0; tick < MAX_DAYS * TICKS_PER_DAY; tick++) {
      sim.scheduler.tick({ tick });

      // Order the keep the moment the settlement EARNS Town — the player's move, through
      // the real gate. (Once per run; the decision is a pure function of sim state.)
      if (!keepOrdered && tierAtLeast(lp.tier, "Town")) {
        townDay = sim.state.day;
        keepOrdered = true;
        sim.commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: keep.x, y: keep.y } });
      }
      if (lp.keepSacked) { sackedDay = sim.state.day; break; }
    }

    // Staged assertions: each names the link in the chain that broke, so a future failure
    // points at a mechanism instead of just "not sacked".
    expect(townDay, "the town never reached Town tier — it cannot unlock a keep").toBeGreaterThanOrEqual(0);
    expect(lp.keepPosition, "Town was reached but the keep still did not place").not.toBeNull();
    expect(lp.raidCount, "a keep stands but no raid ever spawned — the raid clock never anchored").toBeGreaterThan(0);
    expect(sackedDay, "raids arrived but never reached the `sacked` band").toBeGreaterThanOrEqual(0);
    expect(lp.keepSacked).toBe(true);
    expect(lp.gameOver).toBe(true);
  });

  it("the fire-safe lattice is what makes the growth possible — sharp fire never razes it", () => {
    // Not decoration. Under cozyThreats:false a fire DESTROYS buildings, and the previous
    // `sack` layout (3-tile pitch) had each house sitting on ≥3 wooden neighbours within
    // Manhattan 4 — the ignition trigger. Fire ate three houses, popCap collapsed 24 → 6,
    // and the town could never grow to the population Town tier wanted. If this goes red,
    // the sack fixture is about to start failing for the same reason.
    const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, cozyThreats: false });
    const lp = localPlayer(sim.state);
    const { cmds } = layTown(sim.terrain);
    for (const c of cmds) sim.commands.enqueue(c);

    // `state.events` is a capped ring buffer, so a 30-day run would evict the early days —
    // accumulate instead of asserting over the tail.
    const seen = new Set<string>();
    for (let tick = 0; tick < 30 * TICKS_PER_DAY; tick++) {
      sim.scheduler.tick({ tick });
      for (const e of sim.state.events) seen.add(e);
    }

    expect(lp.popCap).toBe(36); // 6 houses × 6 — not one of them burned down
    expect([...seen].some((e) => /caught fire|fire spread/i.test(e))).toBe(false);
  });
});
