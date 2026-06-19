/**
 * NeedsHappinessSystem — computes needs coverage (faith/safety/goods) and happiness.
 * Runs once per in-game day, AFTER production (stockpiles current) and
 * BEFORE immigration (so immigration reads updated happiness).
 *
 * Stage: "needs" (after economy/villagers, before immigration).
 */
import type { System, SimContext } from "@engine/core";
import type { SimState, PlayerState } from "../sim-state";
import { SERVICE_RADII } from "../entities/building";

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

    const houses: Array<{ cx: number; cy: number }> = [];
    const chapels: ServicePoint[] = [];
    const watchposts: ServicePoint[] = [];
    const markets: ServicePoint[] = [];

    for (const entity of buildings) {
      if (entity.building.ownerId !== p.id) continue;
      const b = entity.building;
      const cx = b.x + Math.floor(b.w / 2);
      const cy = b.y + Math.floor(b.h / 2);
      const radius = SERVICE_RADII[b.type] ?? 0;

      if (b.type === "house") {
        houses.push({ cx, cy });
      } else if (b.type === "chapel") {
        chapels.push({ cx, cy, radius });
      } else if (b.type === "watchpost") {
        watchposts.push({ cx, cy, radius });
      } else if (b.type === "market") {
        markets.push({ cx, cy, radius });
      }
    }

    if (houses.length === 0) {
      p.faithCoverage = 0;
      p.safetyCoverage = 0;
      p.goodsCoverage = 0;
      this._updateHappiness(p);
      return;
    }

    const hasGoods = p.stockpiles.bread > 0 || p.stockpiles.grain > 0;

    let faithMet = 0;
    let safetyMet = 0;
    let goodsMet = 0;

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

      if (hasFaith) faithMet++;
      if (hasSafety) safetyMet++;
      if (hasGoodsAccess) goodsMet++;
    }

    p.faithCoverage = faithMet / houses.length;
    p.safetyCoverage = safetyMet / houses.length;
    p.goodsCoverage = goodsMet / houses.length;

    this._updateHappiness(p);
  }

  private _updateHappiness(p: PlayerState): void {
    // Base 40 (no needs met); each need coverage adds up to 20 → max 100
    let h = 40;
    h += p.faithCoverage * 20;
    h += p.safetyCoverage * 20;
    h += p.goodsCoverage * 20;

    // Food surplus: +10 max for surplus, -15 max for deficit
    if (p.foodSurplus > 0) h += Math.min(10, p.foodSurplus * 2);
    if (p.foodSurplus < 0) h += Math.max(-15, p.foodSurplus * 3);

    // Decree penalties
    if (p.activeDecrees.has("rationing"))    h -= 10;
    if (p.activeDecrees.has("tithe"))        h -= 8;
    if (p.activeDecrees.has("workHours"))    h -= 12;
    if (p.activeDecrees.has("conscription")) h -= 5;

    p.happiness = Math.max(0, Math.min(100, Math.round(h)));
  }
}

function manhattanDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}
