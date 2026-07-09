/**
 * ProductionSystem — runs the goods economy each tick.
 *
 * For every connected building with at least one REAL assigned worker
 * (workerCount > 0), once per production cycle (ticksPerCycle):
 *   - Producers (no input good): emit outputPerCycle into the building's
 *       LOCAL outputBuffer. Farms additionally scale by the seasonal grain
 *       multiplier (floored at ~0.5 in winter → food always trickles, cozy #9).
 *   - Converters (input good set): consume inputPerCycle from the GLOBAL
 *       stockpile (the Storehouse pool), then emit outputPerCycle into their
 *       local outputBuffer. Converters also only run with a real worker.
 *
 * Goods only reach the global stockpile when a VillagerSystem hauler carries
 * them from the building's outputBuffer to a connected Storehouse. This means:
 *   - A building with NO assigned worker produces nothing.
 *   - A building disconnected from a Storehouse produces nothing.
 *   - Physical hauling is the mechanism; production.ts never writes to
 *     state.stockpiles directly.
 *
 * STOCKPILE PRESSURE (two-way service loop, 2026-06-27; cozy-pivot Phase H,
 * 2026-07-01). OpenTTD's defining loop is that production reacts to whether the
 * output is actually moved: under-served industries throttle, well-served ones keep
 * flowing. We model the downside half deterministically (no RNG) as a **throttle,
 * never a halt** (the cozy downside rule #9 — every problem slows toward a floor, no
 * cliff): a building's local outputBuffer is capped at a few cycles' worth of output;
 * as it fills (no hauler drawing it down), the per-cycle output ramps DOWN toward the
 * productivity floor rather than stopping outright. Only a genuinely full buffer
 * clamps the amount so it can never overflow the cap. So a chronically unserved
 * building trickles at the floor (goods visibly backing up at its door) instead of
 * going dark, and the road/hauling quality that empties the buffer is the lever that
 * keeps it at full rate. A converter still doesn't consume its input when it would
 * produce nothing (the input draw is gated on a positive throttled amount), so
 * nothing is wasted. Purely a function of buffer state → determinism is preserved
 * (proven by the byte-identical headless diff).
 *
 * Stage: "economy" (after connectivity).
 */
import type { System, SimContext } from "@engine/core";
import { getProductionDef, effectiveOutputPerCycle, SERVICE_RADII, manhattanDist } from "../entities/building";
import type { SimState, PlayerState } from "../sim-state";
import { getSeason, grainMultiplier } from "../world/seasons";

/**
 * Stockpile-pressure cap: how many cycles' worth of output a building may hold in
 * its local buffer before it stops producing (waiting for a hauler to draw it
 * down). Small enough that a never-collected building idles within ~a day, large
 * enough that ordinary hauling latency never stalls a served building. The cap is
 * computed per-building from its effective output so big producers get
 * proportional headroom; floored so a 0-output edge case can't divide oddly.
 */
const OUTPUT_BUFFER_CYCLES = 5;

/** The output-buffer cap for a building producing `perCycle` each cycle. */
export function outputBufferCap(perCycle: number): number {
  return Math.max(1, perCycle) * OUTPUT_BUFFER_CYCLES;
}

/**
 * Fraction of the buffer that can fill at FULL output rate before the throttle
 * begins. Below this the building runs flat-out; above it output ramps linearly
 * down toward {@link PRODUCTIVITY_FLOOR} as the buffer approaches its cap.
 */
const BUFFER_THROTTLE_KNEE = 0.6;

/**
 * Cozy-pivot Phase H: stockpile-pressure THROTTLE (never a halt). Given a buffer at
 * `buffer` against `cap`, return an output multiplier in `[PRODUCTIVITY_FLOOR, 1]`:
 * full rate while the buffer is below the {@link BUFFER_THROTTLE_KNEE} knee, then a
 * linear ramp down to the floor as it fills. NEVER 0 (the downside rule #9) — a
 * chronically unserved building keeps trickling at the floor rather than going dark.
 * Pure (deterministic function of buffer state only).
 */
export function bufferThrottleFactor(buffer: number, cap: number): number {
  if (cap <= 0) return 1;
  const fill = Math.max(0, Math.min(1, buffer / cap));
  if (fill <= BUFFER_THROTTLE_KNEE) return 1;
  const t = (fill - BUFFER_THROTTLE_KNEE) / (1 - BUFFER_THROTTLE_KNEE); // 0..1
  return 1 - (1 - PRODUCTIVITY_FLOOR) * t;
}

/**
 * Cozy-pivot Phase B: happiness → productivity floor. Output scales LINEARLY
 * with happiness but never collapses to 0 — it bottoms out at this floor (so an
 * unhappy town slows down, it does not death-spiral). The single tunable: raise
 * for a gentler economy, lower for a harsher one.
 */
const PRODUCTIVITY_FLOOR = 0.6;

/**
 * Per-cycle output multiplier for a building whose relevant happiness is `h`
 * (0..100). Linear ramp from {@link PRODUCTIVITY_FLOOR} at h=0 to 1.0 at h=100,
 * monotonic and clamped so it is NEVER below the floor (h=50 → 0.8). Pure.
 */
export function productivityFactor(h: number): number {
  const t = Math.max(0, Math.min(100, h)) / 100;
  return PRODUCTIVITY_FLOOR + (1 - PRODUCTIVITY_FLOOR) * t;
}

/**
 * Cozy-pivot Phase G: the work-hours output lift is now an AUTONOMOUS, SPATIAL
 * effect of the town hall (a placement bonus, not a decree). A producer whose
 * centre lies within a town-hall's SERVICE_RADII gets a steady output multiplier.
 * Re-homed from the old `workHours` decree's +30% down to a gentler steady +20%
 * (the decree was a spiky, happiness-costing lever; this is a quiet, always-on
 * reward for building near your civic centre — no happiness cost). Floors at 1.
 */
const TOWN_HALL_OUTPUT_LIFT = 1.2;

export class ProductionSystem implements System {
  readonly name = "ProductionSystem";

  constructor(private readonly state: SimState) {}

  run(ctx: SimContext): void {
    const state = this.state;

    // Cozy-pivot Phase B: resolve the LOCAL happiness signal once per pass. For
    // each workplace centre, find a worker assigned there and read its HOME house's
    // `mood` (the Phase A per-house signal). Built up-front into a map keyed by the
    // workplace centre so the building loop is O(1) per building rather than scanning
    // all villagers per building. Iteration order is irrelevant — last writer wins,
    // and workers sharing a workplace share an owner; mood differences between two
    // workers' homes are sub-tile noise the floor already smooths over.
    const workplaceHomeMood = new Map<number, number>();
    for (const v of state.villagerWorld.query("villager")) {
      const home = state.buildingState.get(
        this.buildingIdAt(v.villager.homeX, v.villager.homeY),
      );
      const mood = home?.mood;
      if (mood === undefined) continue;
      workplaceHomeMood.set(this.tileKey(v.villager.workX, v.villager.workY), mood);
    }

    // Citadel 28: per-player economy. Each player's production is independent;
    // iterate players in stable id order, acting on the buildings they own.
    for (const p of state.players) {
      // Cozy-pivot Phase G: town-hall coverage points for THIS player — producers
      // whose centre lies within a town-hall's SERVICE_RADII get the autonomous
      // work-hours output lift (a spatial placement bonus, no decree, no cost).
      const townHalls = this.townHallPoints(p);

      for (const entity of state.buildingWorld.query("building")) {
        if (entity.building.ownerId !== p.id) continue;
        const id = entity.id;
        if (id === undefined) continue;
        const rs = state.buildingState.get(id);
        if (rs === undefined) continue;
        const def = getProductionDef(entity.building.type);
        if (def === undefined) continue;
        if (def.workerSlots <= 0) continue; // storage / housing / road

        // A building only produces if it has at least one real assigned worker.
        if (rs.workerCount <= 0) continue;

        // Fire suppression (ephemeral, set by FireSystem this-1 tick): a burning
        // building — or a neighbour within FIRE_SUPPRESS_RADIUS — halts production
        // without losing its worker. The flag clears automatically once the fire
        // is out, so production resumes with the SAME villager still assigned.
        if (rs.suppressed === true) continue;

        // A building only produces if it is connected to a Storehouse.
        if (!rs.connected) continue;

        // Stockpile pressure (Phase H — throttle, never halt): resolve the buffer
        // fill throttle for producers up-front. As the local buffer fills (no hauler
        // draining it), `bufferThrottle` ramps output down toward the floor; only a
        // genuinely full buffer clamps the final amount below (never overflows the
        // cap). A pure consumer/no-output building has no cap concept and runs at 1.
        // Resolved BEFORE the cycle timer + input draw so the throttle scales the
        // whole cycle and a blocked converter never wastes input (the input draw is
        // gated on a positive throttled amount).
        let bufferThrottle = 1;
        let bufferCap = Infinity;
        if (def.outputGood !== undefined && def.outputPerCycle > 0) {
          bufferCap = outputBufferCap(effectiveOutputPerCycle(def, rs.level));
          // Genuinely full (no headroom): skip the whole cycle BEFORE the timer and
          // input draw, exactly as the old hard guard did — so a converter never
          // consumes input it can't turn into shippable output. The throttle below
          // handles the *partial*-fill ramp; this handles the hard ceiling.
          if (rs.outputBuffer >= bufferCap) continue;
          bufferThrottle = bufferThrottleFactor(rs.outputBuffer, bufferCap);
        }

        // Cycle timer — first fire after a full cycle has elapsed.
        if (ctx.tick - rs.productionTick < def.ticksPerCycle) continue;
        rs.productionTick = ctx.tick;

        // Converters draw their input good from the owner's stockpile (goods
        // previously hauled to a Storehouse by workers from upstream producers).
        if (def.inputGood !== undefined && def.inputPerCycle > 0) {
          if (p.stockpiles[def.inputGood] < def.inputPerCycle) continue;
          p.stockpiles[def.inputGood] -= def.inputPerCycle;
        }

        if (def.outputGood === undefined || def.outputPerCycle <= 0) continue;

        let amount = effectiveOutputPerCycle(def, rs.level);
        if (def.outputGood === "grain") {
          const season = getSeason(state.day, state.daysPerYear);
          amount = Math.floor(amount * grainMultiplier(season));
        }
        if (amount <= 0) continue;

        // Cozy-pivot Phase B: scale output by happiness, never below the floor.
        // Prefer the LOCAL signal — the assigned worker's home-house mood — and
        // fall back to the per-player happiness when no worker/home resolves
        // (e.g. timing before a villager is assigned). The happiness factor is a
        // *throttle*, never a cliff (cozy contract #9): a building that would
        // produce ≥1 always still produces ≥1, so a base-1 producer (L1 mine/
        // smith → 1 tool/stone) keeps trickling at low happiness instead of
        // flooring to 0 and stalling the chain. Math.max(1, …) after the floor
        // enforces this; output stays an integer.
        const b = entity.building;
        const cx = b.x + Math.floor(b.w / 2);
        const cy = b.y + Math.floor(b.h / 2);

        // Cozy-pivot Phase G: autonomous work-hours lift — a producer within a
        // town-hall's SERVICE_RADII gets a steady output multiplier (a spatial
        // placement bonus, not a decree; no happiness cost). Applied BEFORE the
        // happiness throttle so the throttle scales the lifted amount, mirroring
        // where the old workHours decree sat. Deterministic (pure geometry).
        if (townHalls.some((t) => manhattanDist(cx, cy, t.cx, t.cy) <= t.radius)) {
          amount = Math.floor(amount * TOWN_HALL_OUTPUT_LIFT);
        }

        const localHappiness =
          workplaceHomeMood.get(this.tileKey(cx, cy)) ?? p.happiness;
        amount = Math.max(1, Math.floor(amount * productivityFactor(localHappiness)));

        // Cozy-pivot Phase H: stockpile-pressure throttle — as the local buffer
        // fills (no hauler draining it), slow output toward the floor instead of
        // halting. Like the happiness factor, it is a throttle that still trickles
        // ≥1 (Math.max(1,…)), so a chronically unserved building keeps producing at
        // the floor rather than going dark. Then clamp so the buffer never exceeds
        // its cap (the true upper bound the old hard-`continue` guaranteed).
        amount = Math.max(1, Math.floor(amount * bufferThrottle));
        // Clamp so a single throttled cycle can't overshoot the cap (headroom is
        // always > 0 here — the genuinely-full case already `continue`d above).
        amount = Math.min(amount, bufferCap - rs.outputBuffer);

        // Output goes into the building's LOCAL buffer. It does NOT enter the
        // owner's stockpile until a villager hauls it to a Storehouse.
        rs.outputBuffer += amount;
      }
    }
  }

  /** Deterministic tile-index key (ty*width+tx) for a building/workplace centre. */
  private tileKey(tx: number, ty: number): number {
    return ty * this.state.width + tx;
  }

  /**
   * Town-hall coverage centres (+ reach) owned by player `p`. A producer within a
   * town-hall's SERVICE_RADII gets the autonomous work-hours output lift. Iteration
   * order is irrelevant (`.some(...)` membership test) and it's pure geometry, so
   * determinism is preserved.
   */
  private townHallPoints(p: PlayerState): Array<{ cx: number; cy: number; radius: number }> {
    const points: Array<{ cx: number; cy: number; radius: number }> = [];
    const radius = SERVICE_RADII["town-hall"] ?? 0;
    for (const entity of this.state.buildingWorld.query("building")) {
      const b = entity.building;
      if (b.ownerId !== p.id || b.type !== "town-hall") continue;
      points.push({
        cx: b.x + Math.floor(b.w / 2),
        cy: b.y + Math.floor(b.h / 2),
        radius,
      });
    }
    return points;
  }

  /**
   * ECS id of the building whose footprint covers tile (tx,ty), or -1 if none.
   * Used to resolve a villager's home house from its homeX/homeY centre. Linear
   * scan over buildings — acceptable here: it runs once per villager per pass,
   * and villager/building counts are small in Citadel.
   */
  private buildingIdAt(tx: number, ty: number): number {
    for (const entity of this.state.buildingWorld.query("building")) {
      const b = entity.building;
      if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) {
        return entity.id ?? -1;
      }
    }
    return -1;
  }
}
