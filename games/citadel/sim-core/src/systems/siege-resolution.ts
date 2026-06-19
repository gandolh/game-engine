/**
 * SiegeResolutionSystem — resolves a raid when its group reaches a defensive
 * building or the keep.
 *
 * Stage: "siege-resolve" (after movement). Defensive strength is recomputed
 * each tick from tower/garrison/keep `defenseStrength` plus a small bonus per
 * wall tile adjacent to a defended building (chokepoints matter). The clash
 * outcome is seeded per-raider so it stays deterministic.
 *
 * Citadel 28: per-player. Each player defends their own settlement against their
 * own raider groups. Solo is the 1-player case; the RNG fork labels are keyed by
 * raider id (per-player raidCount) so solo replays byte-identically.
 */
import type { System, SimContext, Rng } from "@engine/core";
import type { SimState, RaiderState, PlayerState } from "../sim-state";
import { pushEvent } from "../sim-state";
import { getProductionDef, effectiveDefenseStrength } from "../entities/building";

type SiegeResult = "repelled" | "damage" | "sacked";

/** Citadel 09: each available (conscripted) villager adds this much defense during a raid. */
const CONSCRIPTION_DEFENSE_FACTOR = 0.5;

/** Sum defenseStrength of player `p`'s defended buildings + 1 per wall adjacent to one. */
export function computeDefensiveStrength(state: SimState, p: PlayerState): number {
  let total = 0;
  const defendedTiles = new Set<number>();

  for (const entity of state.buildingWorld.query("building")) {
    if (entity.building.ownerId !== p.id) continue;
    const b = entity.building;
    const def = getProductionDef(b.type);
    if (def === undefined || def.defenseStrength === undefined) continue;
    const rs = entity.id !== undefined ? state.buildingState.get(entity.id) : undefined;
    total += effectiveDefenseStrength(def, rs?.level ?? 1);
    // Mark this building's footprint tiles as "defended".
    for (let dy = 0; dy < b.h; dy++) {
      for (let dx = 0; dx < b.w; dx++) {
        const tx = b.x + dx;
        const ty = b.y + dy;
        if (tx >= 0 && ty >= 0 && tx < state.width && ty < state.height) {
          defendedTiles.add(ty * state.width + tx);
        }
      }
    }
  }

  // +1 per (this player's) wall tile orthogonally adjacent to a defended building tile.
  for (const wallIdx of p.wallTiles) {
    const wx = wallIdx % state.width;
    const wy = (wallIdx - wx) / state.width;
    const neighbors: Array<[number, number]> = [
      [wx, wy - 1],
      [wx + 1, wy],
      [wx, wy + 1],
      [wx - 1, wy],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
      if (defendedTiles.has(ny * state.width + nx)) {
        total += 1;
        break;
      }
    }
  }

  // Citadel 09 — CONSCRIPTION: while a raid is active, available villagers are
  // called to man the walls, adding a modest defense term (so it complements
  // towers/walls rather than replacing them). Production pauses in return
  // (see production.ts). Deterministic: pure integer arithmetic on population.
  if (p.activeDecrees.has("conscription") && p.raiders.length > 0) {
    total += Math.floor(p.population * CONSCRIPTION_DEFENSE_FACTOR);
  }

  return total;
}

export function resolveSiege(raidStrength: number, defenseStrength: number, _rng: Rng): SiegeResult {
  if (defenseStrength >= raidStrength * 1.5) return "repelled";
  if (defenseStrength >= raidStrength * 0.5) return "damage";
  return "sacked";
}

/** True if the raider is on or orthogonally adjacent to player `p`'s keep footprint. */
function isAtKeep(raider: RaiderState, state: SimState, p: PlayerState): boolean {
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.building.ownerId !== p.id) continue;
    const b = entity.building;
    const def = getProductionDef(b.type);
    if (def?.isKeep !== true) continue;
    if (tileTouchesFootprint(raider.tileX, raider.tileY, b.x, b.y, b.w, b.h)) return true;
  }
  return false;
}

/** True if the raider is on or adjacent to any of player `p`'s defensive buildings or wall tiles. */
function isAtDefense(raider: RaiderState, state: SimState, p: PlayerState): boolean {
  // Adjacent to one of p's wall tiles?
  const tx = raider.tileX;
  const ty = raider.tileY;
  const around: Array<[number, number]> = [
    [tx, ty],
    [tx, ty - 1],
    [tx + 1, ty],
    [tx, ty + 1],
    [tx - 1, ty],
  ];
  for (const [ax, ay] of around) {
    if (ax < 0 || ay < 0 || ax >= state.width || ay >= state.height) continue;
    if (p.wallTiles.has(ay * state.width + ax)) return true;
  }
  // Adjacent to one of p's defended buildings?
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.building.ownerId !== p.id) continue;
    const b = entity.building;
    const def = getProductionDef(b.type);
    if (def === undefined || def.defenseStrength === undefined) continue;
    if (tileTouchesFootprint(tx, ty, b.x, b.y, b.w, b.h)) return true;
  }
  return false;
}

function tileTouchesFootprint(tx: number, ty: number, bx: number, by: number, bw: number, bh: number): boolean {
  // On or orthogonally adjacent to the (expanded by 1) footprint rectangle.
  return tx >= bx - 1 && tx <= bx + bw && ty >= by - 1 && ty <= by + bh;
}

/** Remove 1-2 of player `p`'s non-keep, non-house buildings and lose 1-2 of its pop. */
function applyRaidDamage(state: SimState, p: PlayerState, raidStrength: number, rng: Rng): void {
  // Collect candidate buildings owned by p (anything that is not keep or housing).
  const candidates: number[] = []; // entity ids
  for (const entity of state.buildingWorld.query("building")) {
    if (entity.id === undefined) continue;
    if (entity.building.ownerId !== p.id) continue;
    const def = getProductionDef(entity.building.type);
    if (def?.isKeep === true) continue;
    if (def?.isHousing === true) continue;
    candidates.push(entity.id);
  }

  const loss = Math.min(candidates.length, raidStrength >= 30 ? 2 : 1 + rng.int(0, 2));
  for (let i = 0; i < loss && candidates.length > 0; i++) {
    const pickIdx = rng.int(0, candidates.length);
    const targetId = candidates[pickIdx]!;
    candidates.splice(pickIdx, 1);
    // Find and despawn the building entity.
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.id !== targetId) continue;
      const b = entity.building;
      const def = getProductionDef(b.type);
      state.occupancy.remove({ x: b.x, y: b.y, w: b.w, h: b.h });
      // Clear footprint tiles + special tile sets.
      for (let dy = 0; dy < b.h; dy++) {
        for (let dx = 0; dx < b.w; dx++) {
          const ttx = b.x + dx;
          const tty = b.y + dy;
          if (ttx < 0 || tty < 0 || ttx >= state.width || tty >= state.height) continue;
          const idx = tty * state.width + ttx;
          state.buildingTiles.delete(idx);
          p.wallTiles.delete(idx);
          p.gateTiles.delete(idx);
          if (def?.isRoad === true) state.roadGrid[idx] = 0;
        }
      }
      state.buildingState.delete(targetId);
      state.buildingWorld.despawn(entity);
      break;
    }
  }

  // Lose 1-2 population.
  const popLoss = 1 + rng.int(0, 2);
  p.population = Math.max(0, p.population - popLoss);
  p.happiness = Math.max(0, p.happiness - 8);
  state.connectivityDirty = true;
}

export class SiegeResolutionSystem implements System {
  readonly name = "SiegeResolutionSystem";

  constructor(private readonly state: SimState) {}

  run(_ctx: SimContext): void {
    const state = this.state;

    // Citadel 28: resolve each player's siege independently (stable id order).
    for (const p of state.players) {
      // Defensive strength is always kept current (for HUD even with no raiders).
      p.defensiveStrength = computeDefensiveStrength(state, p);

      if (p.raiders.length === 0) continue;

      const toRemove: number[] = [];
      for (let i = 0; i < p.raiders.length; i++) {
        const raider = p.raiders[i]!;
        if (raider.resolved) { toRemove.push(i); continue; }

        const atKeep = isAtKeep(raider, state, p);
        const atDefense = isAtDefense(raider, state, p);

        // Also resolve a raider that has exhausted its path and is near the target.
        const target = findCenterTarget(state, p);
        const exhaustedAtTarget =
          raider.pathStep >= raider.path.length &&
          raider.path.length > 0 &&
          Math.abs(raider.tileX - target.x) <= 2 &&
          Math.abs(raider.tileY - target.y) <= 2;

        if (!atKeep && !atDefense && !exhaustedAtTarget) continue;

        const result = resolveSiege(
          raider.strength,
          p.defensiveStrength,
          state.rng.fork(`siege-${raider.id}`),
        );
        raider.resolved = true;

        if (result === "repelled") {
          p.threatLevel = Math.max(0, p.threatLevel - 10);
          pushEvent(state, `Day ${state.day + 1}: Raid ${raider.id} REPELLED! Defense held.`);
        } else if (result === "damage") {
          applyRaidDamage(state, p, raider.strength, state.rng.fork(`raid-damage-${raider.id}`));
          pushEvent(state, `Day ${state.day + 1}: Raid ${raider.id} caused DAMAGE! Buildings lost.`);
        } else {
          applyRaidDamage(state, p, raider.strength * 2, state.rng.fork(`raid-damage-${raider.id}`));
          if (atKeep) {
            p.keepSacked = true;
            p.gameOver = true;
            pushEvent(state, `Day ${state.day + 1}: THE KEEP IS SACKED! Game over.`);
          } else {
            pushEvent(state, `Day ${state.day + 1}: Raid ${raider.id} sacked outer defenses!`);
          }
        }
        toRemove.push(i);
      }

      // Remove resolved raiders (iterate backwards to preserve indices).
      for (let i = toRemove.length - 1; i >= 0; i--) {
        p.raiders.splice(toRemove[i]!, 1);
      }
    }
  }
}

function findCenterTarget(state: SimState, p: PlayerState): { x: number; y: number } {
  if (p.keepPosition !== null) return p.keepPosition;
  return { x: Math.floor(state.width / 2), y: Math.floor(state.height / 2) };
}
