import { isWalkable } from "@citadel/sim-core";
import type { CitadelCommand, TerrainGrid } from "@citadel/sim-core";
import { findClear } from "./helpers";

/**
 * "Sack" scenario — RE-LAID 2026-07-11 as a real playthrough (see below).
 *
 * This is the ONLY fixture that drives the SHARP (`cozyThreats:false`) raid
 * resolution end to end, so it is the thing brief 103 (Challenge mode) and brief
 * 113 (raid gets a body) are built on. It must earn its ending, not be handed it.
 *
 * ## Why it stopped sacking (three linked defects, all now designed out)
 *
 * 1. `cozyThreats` defaults to TRUE (cozy pivot Phase D, 2026-07-01) and a cozy
 *    raid pilfers goods and leaves — it can NEVER sack, by contract. The scenario
 *    never passed the flag, so from that day it silently asserted nothing.
 *    (Fixed separately in `main()`: `isSiegeScenario()` now opts into the sharp path.)
 *
 * 2. The old layout placed a `keep` on DAY 0 at Hamlet tier. `TIER_LOCK.keep`
 *    is "Town", so the command was REJECTED — and since raids are gated entirely on
 *    `keepPosition` (raid-spawn.ts), no keep meant no raid clock, no threat, no
 *    raiders, nothing to sack. The reject was not even silent: the run logged
 *    "Day 0: a keep needs Town tier — unlock it first." Nobody read it.
 *
 * 3. Turning the sharp path back on (1) also un-gated SHARP FIRE, which DESTROYS
 *    buildings instead of smouldering. The old layout parked its four houses on a
 *    3-tile pitch — dense enough that each had ≥3 wooden neighbours within 4 tiles,
 *    which is exactly the ignition trigger — so fire razed three of them and popCap
 *    collapsed 24 → 6. The town could then never reach the pop it needed to tier up.
 *
 * ## The re-lay (the brief-100 `starve` precedent: build it for a REASON)
 *
 * The town is laid out on a LATTICE with a 4-tile column pitch and a 5-tile row
 * pitch. That is not cosmetic — it is the fire rule inverted:
 * `FireSystem._checkIgnition` ignites a wooden building only when ≥3 other wooden
 * buildings sit within Manhattan 4 of its centre. On this lattice an in-row
 * neighbour is exactly 4 away (counted) and a cross-row neighbour is 5 (not), so
 * every wooden building has AT MOST 2 wooden neighbours in range and spontaneous
 * ignition is structurally impossible. The town is fireproof BY LAYOUT — which is
 * the lesson the sharp fire hazard is there to teach.
 *
 * With the town no longer burning down it grows honestly:
 *   - 20 structures from day 0 (≥15, the Town buildings-path threshold, with 5 to
 *     spare so a raid or two can raze one without dropping the settlement back).
 *   - 6 houses → popCap 36, so growth is gated by FOOD, not by housing.
 *   - 2 farms → 2 mills → 2 bakeries, all within ~9 tiles of the storehouse, so the
 *     haulers keep up and the service bonus pays (the brief-100 upside).
 *   - 2 chapels + 1 market + 1 watchpost → needs coverage → happiness stays >40,
 *     which keeps immigration rolling and keeps disease onset off the amplifier.
 *   - 1 healer covering the houses → a disease outbreak cannot kill (deathRate 0.05
 *     with `healerNear`, and no guaranteed minimum death) → pop only ever climbs.
 *
 * Population crosses 10 around day 11 → with 20 structures that satisfies Town
 * (`nonRoadBuildings ≥ 15 AND pop ≥ 10`). ONLY THEN is the keep placed — `main()`
 * watches the tier and enqueues it the moment the settlement earns it, exactly as a
 * player would. So the keep now lands through the real `TIER_LOCK` gate.
 *
 * The keep stands ALONE — defenseStrength 8, no towers, no garrison, no walls. The
 * raid clock anchors to it: raid 1 (str 10) ~5 days later, then every ~7-8 days,
 * escalating +5. `resolveSiege` bands on defence:strength ratio — 8:10 = 0.8 and
 * 8:15 = 0.53 are the "mid" band (mostly damage, 10% sack), 8:20 = 0.4 drops into
 * the "weak" band (85% sack). So the town is ground down and the keep falls, with
 * the economy still alive around it — a sack, not a starvation.
 *
 * At the default seed: Town on day 12, keep raised day 13, THE KEEP IS SACKED on day 50.
 *
 * NB the town plateaus around pop 17-18 (two bakeries is the bread ceiling; grain and
 * flour visibly pile up behind them) and you will see the odd "a villager starved" as it
 * sits on that ceiling. That is an EQUILIBRIUM, not a collapse — pop is still 17 and all
 * 351 buildings still connected when the keep falls, and `gameOver` is set by
 * "THE KEEP IS SACKED", never by the town dying out. Don't mistake this for `starve`.
 *
 * Returns the keep's site rather than a command: it is placed LATER, on tier-up.
 */

/** Column pitch of the sack town's lattice. In-row wooden neighbours land at Manhattan 4 → counted by the fire rule (2 max). */
const SACK_COL_PITCH = 4;
/** Row pitch. Cross-row neighbours land at Manhattan 5 → OUTSIDE the fire rule's range-4 window. */
const SACK_ROW_PITCH = 5;

/**
 * The lattice, row-major. Every entry is a slot at
 * (X + col*SACK_COL_PITCH, Y + row*SACK_ROW_PITCH).
 *
 * Widest footprint is 3 (farm, storehouse), so a 4-tile column pitch always leaves a
 * 1-tile road gap; tallest is 3 (farm), so a 5-tile row pitch leaves 2. Every building
 * type here has its centre at top-left + (1,1), which is what makes the pitch arithmetic
 * above hold exactly for the fire rule.
 *
 * `well` and `healer` are NOT in FireSystem's WOODEN_TYPES, so they are free real estate
 * on the lattice — they break up the wooden runs without adding to anyone's neighbour count.
 */
const SACK_LATTICE: ReadonlyArray<ReadonlyArray<string>> = [
  ["mill",   "farm",       "farm",   "mill"],
  ["bakery", "storehouse", "well",   "bakery"],
  ["chapel", "house",      "house",  "market"],
  ["house",  "watchpost",  "healer", "house"],
  ["well",   "house",      "house",  "chapel"],
];

/** Where the sack town's keep goes once the settlement earns Town tier. */
export interface SackPlan {
  readonly cmds: CitadelCommand[];
  readonly keep: { x: number; y: number };
}

export function buildSackScenario(terrain: TerrainGrid): SackPlan {
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);

  // ONE clear region for the whole town + the keep site below it. Deliberately not
  // findClear-per-building (as the other scenarios do): a per-building search nudges
  // individual buildings off the lattice to dodge a rough tile, and any such nudge can
  // pull a third wooden neighbour inside the range-4 window and re-arm the ignition rule
  // the layout exists to defeat. One region → the pitch is exact by construction.
  const REGION_W = 17; // road margin (1) + 3 col pitches + widest footprint (3) + margin (1)
  const REGION_H = 31; // road margin (1) + 4 row pitches + footprint (2) + spine/keep (8)
  const region = findClear(terrain, REGION_W, REGION_H, cx - 8, cy - 15);
  const X = region.x + 1;
  const Y = region.y + 1;

  const cmds: CitadelCommand[] = [];
  // Footprint tiles, so the road carpet below can fill only the GAPS (a road command
  // onto an occupied tile is rejected, which would spam the event log with "N road
  // tiles blocked — the run has a gap").
  const footprint = new Set<number>();
  const claim = (x: number, y: number, w: number, h: number): void => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) footprint.add((y + dy) * terrain.width + (x + dx));
  };

  for (let row = 0; row < SACK_LATTICE.length; row++) {
    const slots = SACK_LATTICE[row]!;
    for (let col = 0; col < slots.length; col++) {
      const type = slots[col]!;
      const x = X + col * SACK_COL_PITCH;
      const y = Y + row * SACK_ROW_PITCH;
      cmds.push({ type: "placeBuilding", payload: { buildingType: type, x, y } });
      const size = SACK_FOOTPRINTS[type] ?? { w: 2, h: 2 };
      claim(x, y, size.w, size.h);
    }
  }

  // The keep's site: below the town, on the clear region's southern strip. Placed later
  // (on tier-up), so nothing may be built on these tiles now — the road ring below stops
  // one tile short of the footprint on every side.
  const keep = { x: X + 4, y: Y + 25 };

  // ---------- Roads ----------
  // A carpet over the lattice's gaps: connects every building to the storehouse AND
  // (bonus) lays a firebreak on the line between most wooden pairs, so even a
  // raider-set blaze struggles to spread (FireSystem._hasFirebreak treats a road tile
  // on the centre-to-centre line as a break).
  const roadTiles: Array<{ x: number; y: number }> = [];
  const push = (x: number, y: number): void => {
    if (!isWalkable(terrain, x, y)) return;
    if (footprint.has(y * terrain.width + x)) return;
    roadTiles.push({ x, y });
  };
  const townBottom = Y + (SACK_LATTICE.length - 1) * SACK_ROW_PITCH + 2; // last row's footprint bottom
  for (let y = Y - 1; y <= townBottom + 1; y++) {
    for (let x = X - 1; x <= X + 3 * SACK_COL_PITCH + 2; x++) push(x, y);
  }
  // Spine down to the keep, then a ring around its 3×3 footprint so it road-connects.
  for (let y = townBottom + 2; y < keep.y; y++) push(keep.x + 1, y);
  for (let y = keep.y - 1; y <= keep.y + 3; y++) {
    for (let x = keep.x - 1; x <= keep.x + 3; x++) {
      if (x >= keep.x && x < keep.x + 3 && y >= keep.y && y < keep.y + 3) continue; // the keep's own tiles
      push(x, y);
    }
  }

  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return { cmds, keep };
}

/** Footprints of the types the sack lattice uses (mirrors BUILDING_DEFS). */
const SACK_FOOTPRINTS: Readonly<Record<string, { w: number; h: number }>> = {
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
