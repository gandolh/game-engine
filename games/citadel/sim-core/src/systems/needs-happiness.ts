/**
 * NeedsHappinessSystem — computes needs coverage (faith/safety/goods) and happiness.
 * Runs once per in-game day, AFTER production (stockpiles current) and
 * BEFORE immigration (so immigration reads updated happiness).
 *
 * Stage: "needs" (after economy/villagers, before immigration).
 */
import type { System, SimContext } from "@engine/core";
import type { SimState, PlayerState } from "../sim-state";
import { SERVICE_RADII, manhattanDist } from "../entities/building";

/**
 * Cozy-pivot Phase G: festivals are AUTONOMOUS + SPATIAL. A `public-square`
 * projects a festival mood lift over the homes within its SERVICE_RADII — there
 * is no `festival` decree, no bread cost, no player command. This is the steady
 * happiness a home gets for being in reach of a place to gather. Applied per-house
 * (folded into `mood`) AND to the town aggregate (× the fraction of homes covered)
 * so the two can't drift — exactly like faith/safety/goods coverage.
 */
const FESTIVAL_HAPPINESS_BONUS = 15;

/**
 * Happiness lift per met need (faith/safety/goods). Base mood is 40 and each met
 * need adds this, so all three met → 100. Shared by the town-aggregate
 * _updateHappiness (× coverage ratio) and the per-house mood (× the house's own
 * met/unmet boolean) so the two can't drift.
 */
const PER_NEED_HAPPINESS = 20;

/**
 * Phase B Chunk 1 — STATEFUL happiness with ASYMMETRIC drift.
 *
 * Both town happiness and per-house mood no longer snap to their computed value;
 * they EASE toward it as a per-day target: `h += (target - h) * rate`. The two
 * rates are deliberately asymmetric — happiness HEALS faster than it FALLS
 * (recoveryRate > decayRate). Because every dip over-recovers, the "no death
 * spiral" floor becomes a property of the update rule itself, and a transient
 * dent breathes (eases in over ~1-2 days, recovers over ~2-3) instead of
 * flickering on/off the next day.
 *
 * Tuning (pure geometric ease, error after n days = (1-rate)^n × initial error):
 *   recoveryRate 0.45 → a dent recovers to within ~1 point of target in ~3 days
 *     (a 20-point gap: 20 → 11 → 6 → 3.3 → 1.8 → 1.0, i.e. ≤1 by day ~5, ≤3 by
 *     day 3; "feels recovered" in ~2-3 days).
 *   decayRate 0.30 → the same 20-point gap takes longer to fall (20 → 14 → 9.8
 *     → 6.9 → 4.8 …), so a drop lands over ~1-2 days with no jump-scare and
 *     always lags behind how fast it would have recovered.
 * Single source of truth: both the town aggregate and every house use these.
 */
const HAPPINESS_RECOVERY_RATE = 0.45;
const HAPPINESS_DECAY_RATE = 0.3;

/**
 * Ease a persistent value toward a freshly-computed target with asymmetric
 * rates (recover faster than decay), then clamp+round to an int 0..100. Pure
 * arithmetic of (prior, target) — no randomness, no wall-clock; deterministic.
 */
function easeHappiness(prior: number, target: number): number {
  const rate = target >= prior ? HAPPINESS_RECOVERY_RATE : HAPPINESS_DECAY_RATE;
  const eased = prior + (target - prior) * rate;
  let result = Math.max(0, Math.min(100, Math.round(eased)));
  // Anti-stall: once the integer result lands adjacent to the (integer) target,
  // rounding the ever-shrinking geometric step would freeze us one point short of
  // the cap forever (e.g. 99 → 99.45 → 99). Snap the last point so a settled
  // town/house actually reaches its target. Pure + deterministic.
  if (result !== target && Math.abs(target - result) <= 1) result = target;
  return result;
}

/**
 * Building types that project a safety footprint (lower fear → higher happiness).
 * watchpost is the dedicated safety building; the fortifications also count
 * (citadel-38 P2#12 — their SERVICE_RADII were previously dead data).
 */
const SAFETY_PROVIDERS: ReadonlySet<string> = new Set([
  "watchpost",
  "tower",
  "garrison",
  "keep",
  "town-hall",
]);

export class NeedsHappinessSystem implements System {
  readonly name = "NeedsHappinessSystem";

  constructor(
    private readonly state: SimState,
    private readonly ticksPerDay: number,
  ) {}

  run(ctx: SimContext): void {
    if (ctx.tick === 0 || ctx.tick % this.ticksPerDay !== 0) return;
    this._computeNeeds();
  }

  private _computeNeeds(): void {
    // Citadel 28: per-player needs/happiness. Each player's coverage is computed
    // from the houses + service buildings THEY own. Stable id-order iteration.
    for (const p of this.state.players) {
      this._computeNeedsFor(p);
    }
  }

  private _computeNeedsFor(p: PlayerState): void {
    const state = this.state;
    const buildings = [...state.buildingWorld.query("building")];

    type ServicePoint = { cx: number; cy: number; radius: number };

    // Carry the entity id alongside each house centre so we can write the
    // per-house mood/needs back into state.buildingState (keyed by id) below.
    const houses: Array<{ cx: number; cy: number; id: number | undefined }> = [];
    const chapels: ServicePoint[] = [];
    const watchposts: ServicePoint[] = [];
    const markets: ServicePoint[] = [];
    // Cozy-pivot Phase G: public-square festival (mood) coverage points.
    const squares: ServicePoint[] = [];

    for (const entity of buildings) {
      if (entity.building.ownerId !== p.id) continue;
      const b = entity.building;
      const cx = b.x + Math.floor(b.w / 2);
      const cy = b.y + Math.floor(b.h / 2);
      const radius = SERVICE_RADII[b.type] ?? 0;

      if (b.type === "house") {
        houses.push({ cx, cy, id: entity.id });
      } else if (b.type === "chapel") {
        chapels.push({ cx, cy, radius });
      } else if (b.type === "public-square") {
        squares.push({ cx, cy, radius });
      } else if (SAFETY_PROVIDERS.has(b.type)) {
        // citadel-38 P2#12: tower/garrison/keep/town-hall had SERVICE_RADII entries
        // (and a comment promising a "safety footprint") that fed nothing — only
        // watchpost provided coverage. Treat all defensive buildings as safety
        // providers so building a tower/garrison actually lowers fear.
        watchposts.push({ cx, cy, radius });
      } else if (b.type === "market") {
        markets.push({ cx, cy, radius });
      }
    }

    if (houses.length === 0) {
      p.faithCoverage = 0;
      p.safetyCoverage = 0;
      p.goodsCoverage = 0;
      this._updateHappiness(p, 0);
      return;
    }

    const hasGoods = p.stockpiles.bread > 0 || p.stockpiles.grain > 0;

    let faithMet = 0;
    let safetyMet = 0;
    let goodsMet = 0;
    let festivalMet = 0;

    for (const house of houses) {
      const hasFaith = chapels.some(
        (c) => manhattanDist(house.cx, house.cy, c.cx, c.cy) <= c.radius,
      );
      const hasSafety = watchposts.some(
        (w) => manhattanDist(house.cx, house.cy, w.cx, w.cy) <= w.radius,
      );
      const hasGoodsAccess =
        hasGoods &&
        markets.some(
          (m) => manhattanDist(house.cx, house.cy, m.cx, m.cy) <= m.radius,
        );
      // Cozy-pivot Phase G: a home in reach of a public square gets a festival mood
      // lift — an autonomous placement effect (no decree, no bread, no command).
      const hasFestival = squares.some(
        (s) => manhattanDist(house.cx, house.cy, s.cx, s.cy) <= s.radius,
      );

      if (hasFaith) faithMet++;
      if (hasSafety) safetyMet++;
      if (hasGoodsAccess) goodsMet++;
      if (hasFestival) festivalMet++;

      // Citadel: keep the per-house booleans the aggregate loop used to discard,
      // and derive a per-house mood from them. Same math shape as
      // _updateHappiness (base 40 + up to 20 per met need) but evaluated for THIS
      // house's met needs only (faith/safety/goods). The town-aggregate
      // food/decree/festival terms intentionally stay out of the per-house mood.
      // This is a pure read of already-computed values; no aggregate output changes.
      if (house.id !== undefined) {
        const rs = state.buildingState.get(house.id);
        if (rs !== undefined) {
          rs.lacksFaith = !hasFaith;
          rs.lacksSafety = !hasSafety;
          rs.lacksGoods = !hasGoodsAccess;
          // Phase B Chunk 1: the base+met-needs sum is now the per-house TARGET;
          // ease the STORED mood toward it (asymmetric, same rates as the town
          // aggregate). Prior mood is the state (freshRuntime seeds it at 40, a
          // brand-new house eases from 40); this lags + over-recovers like h.
          let moodTarget = 40;
          if (hasFaith) moodTarget += PER_NEED_HAPPINESS;
          if (hasSafety) moodTarget += PER_NEED_HAPPINESS;
          if (hasGoodsAccess) moodTarget += PER_NEED_HAPPINESS;
          // Cozy-pivot Phase G: a festival (public-square) in reach lifts this
          // home's mood on top of its met needs — a spatial placement bonus.
          if (hasFestival) moodTarget += FESTIVAL_HAPPINESS_BONUS;
          rs.mood = easeHappiness(rs.mood ?? 40, moodTarget);
        }
      }
    }

    p.faithCoverage = faithMet / houses.length;
    p.safetyCoverage = safetyMet / houses.length;
    p.goodsCoverage = goodsMet / houses.length;

    this._updateHappiness(p, festivalMet / houses.length);
  }

  /**
   * Compute the per-day happiness TARGET and ease the persistent p.happiness
   * toward it asymmetrically (recover faster than fall). `festivalCoverage` is the
   * fraction of this player's homes within a public-square's reach (0 when there
   * are no homes) — a spatial, autonomous festival lift (cozy-pivot Phase G).
   */
  private _updateHappiness(p: PlayerState, festivalCoverage: number): void {
    // Base 40 (no needs met); each need coverage adds up to 20 → max 100
    let h = 40;
    h += p.faithCoverage * PER_NEED_HAPPINESS;
    h += p.safetyCoverage * PER_NEED_HAPPINESS;
    h += p.goodsCoverage * PER_NEED_HAPPINESS;

    // Food surplus: +10 max for surplus, -15 max for deficit
    if (p.foodSurplus > 0) h += Math.min(10, p.foodSurplus * 2);
    if (p.foodSurplus < 0) h += Math.max(-15, p.foodSurplus * 3);

    // Cozy-pivot Phase G: festival (public-square) lift, scaled by the fraction of
    // homes in reach — the town-aggregate mirror of the per-house festival bonus,
    // so the two can't drift (same shape as faith/safety/goods coverage above).
    h += festivalCoverage * FESTIVAL_HAPPINESS_BONUS;

    // `h` is now the TARGET; ease the persistent happiness toward it. Clamp the
    // target too so the ease can never chase an out-of-range goal.
    const target = Math.max(0, Math.min(100, Math.round(h)));
    p.happiness = easeHappiness(p.happiness, target);
  }
}
