/**
 * ArmySystem (Citadel 32) — PvP armies.
 *
 * A launch-attack command (handled in sim-bootstrap) spawns an ArmyState at the
 * attacker's town-hall, auto-pathed (via the one authoritative pathfinder, brief
 * 31) to a targeted enemy building. This system marches each army along its path
 * and, on arrival, resolves it with the SHARED siege math generalized to PvP:
 * attacker army strength vs the defender's defensiveStrength. No unit micro —
 * you target, the sim resolves.
 *
 * Destroying a player's TOWN-HALL eliminates them (generalizes the shipped
 * "keep sacked = game over"). Last player standing wins.
 *
 * MP-only: solo never issues launchAttack, so `state.armies` stays empty and this
 * system is a no-op (solo determinism intact). Resolution RNG is the seeded
 * `state.rng.fork('army-<id>')` — no Math.random/Date.now.
 *
 * Stage: "armies" (after siege-resolve).
 */
import type { System, SimContext } from "@engine/core";
import type { SimState, PlayerState } from "../sim-state";
import { pushEvent, playerById, releaseWorkersAt } from "../sim-state";
import { getProductionDef, effectiveHousingCapacity } from "../entities/building";
import type { BuildingEntity } from "../entities/building";
import { computeDefensiveStrength, resolveSiege } from "./siege-resolution";
import { scaleTicks } from "../pacing";

// One tile every 3 ticks (matches raiders), authored at BASELINE_TICKS_PER_DAY and
// re-denominated to the sim's ticksPerDay (see raider-movement.ts). Frozen path
// (armies are off by default, decision #23) — scaled for consistency with raiders.
const MOVE_INTERVAL = 3;

/** On or orthogonally adjacent to the (footprint expanded by 1) rectangle. */
function tileTouchesFootprint(tx: number, ty: number, bx: number, by: number, bw: number, bh: number): boolean {
  return tx >= bx - 1 && tx <= bx + bw && ty >= by - 1 && ty <= by + bh;
}

/** The defender's building whose footprint covers (x,y), or null. */
function findTargetBuilding(state: SimState, x: number, y: number, ownerId: number): BuildingEntity | null {
  for (const entity of state.buildingWorld.query("building")) {
    const b = entity.building;
    if (b.ownerId !== ownerId) continue;
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return entity;
  }
  return null;
}

/** Despawn a building + release its grid state, crediting the owner's per-player fields. */
function destroyBuilding(state: SimState, entity: BuildingEntity, owner: PlayerState): void {
  const b = entity.building;
  const prod = getProductionDef(b.type);
  if (prod?.isGate !== true) state.occupancy.remove({ x: b.x, y: b.y, w: b.w, h: b.h });
  for (let dy = 0; dy < b.h; dy++) {
    for (let dx = 0; dx < b.w; dx++) {
      const tx = b.x + dx;
      const ty = b.y + dy;
      if (tx < 0 || ty < 0 || tx >= state.width || ty >= state.height) continue;
      const idx = ty * state.width + tx;
      state.buildingTiles.delete(idx);
      owner.wallTiles.delete(idx);
      owner.gateTiles.delete(idx);
      if (prod?.isRoad === true) state.roadGrid[idx] = 0;
    }
  }
  if (prod?.isHousing === true && prod.housingCapacity !== undefined) {
    const rs = entity.id !== undefined ? state.buildingState.get(entity.id) : undefined;
    owner.popCap = Math.max(0, owner.popCap - effectiveHousingCapacity(prod, rs?.level ?? 1));
  }
  if (prod?.isKeep === true) owner.keepPosition = null;
  // Re-idle any villager stationed at the destroyed building before despawn.
  releaseWorkersAt(state, b.x, b.y, b.w, b.h);
  if (entity.id !== undefined) state.buildingState.delete(entity.id);
  state.buildingWorld.despawn(entity);
  state.connectivityDirty = true;
}

export class ArmySystem implements System {
  readonly name = "ArmySystem";

  constructor(private readonly state: SimState) {}

  run(ctx: SimContext): void {
    const state = this.state;
    if (state.armies.length === 0) return; // solo no-op

    const move = ctx.tick % scaleTicks(MOVE_INTERVAL, state.ticksPerDay) === 0;
    const toRemove: number[] = [];

    for (let i = 0; i < state.armies.length; i++) {
      const army = state.armies[i]!;
      if (army.resolved) { toRemove.push(i); continue; }

      if (move && army.pathStep < army.path.length) {
        const next = army.path[army.pathStep]!;
        army.tileX = next.x;
        army.tileY = next.y;
        army.x = next.x;
        army.y = next.y;
        army.pathStep++;
      }

      const target = findTargetBuilding(state, army.targetX, army.targetY, army.targetPlayerId);
      if (target === null) {
        // Target already gone (demolished / destroyed by another army). Disband.
        army.resolved = true;
        pushEvent(state, `Day ${state.day + 1}: an army from player ${army.attackerId} found its target already gone.`);
        toRemove.push(i);
        continue;
      }

      const tb = target.building;
      const reached =
        army.pathStep >= army.path.length ||
        tileTouchesFootprint(army.tileX, army.tileY, tb.x, tb.y, tb.w, tb.h);
      if (!reached) continue;

      const defender = playerById(state, army.targetPlayerId);
      if (defender === undefined) { army.resolved = true; toRemove.push(i); continue; }

      const defense = computeDefensiveStrength(state, defender);
      const result = resolveSiege(army.strength, defense, state.rng.fork(`army-${army.id}`));
      army.resolved = true;

      const isTownHall = getProductionDef(tb.type)?.isKeep === true;

      if (result === "repelled") {
        pushEvent(state, `Day ${state.day + 1}: player ${defender.id} REPELLED player ${army.attackerId}'s army (def ${defense} vs ${army.strength}).`);
      } else if (result === "sacked") {
        destroyBuilding(state, target, defender);
        if (isTownHall) {
          defender.keepSacked = true;
          defender.gameOver = true;
          pushEvent(state, `Day ${state.day + 1}: player ${army.attackerId}'s army SACKED player ${defender.id}'s town hall — ELIMINATED!`);
        } else {
          pushEvent(state, `Day ${state.day + 1}: player ${army.attackerId}'s army destroyed player ${defender.id}'s ${tb.type}.`);
        }
      } else {
        // "damage": a town hall holds (only a full sack topples it); other
        // buildings fall.
        if (isTownHall) {
          pushEvent(state, `Day ${state.day + 1}: player ${defender.id}'s town hall took DAMAGE but held against player ${army.attackerId}.`);
        } else {
          destroyBuilding(state, target, defender);
          pushEvent(state, `Day ${state.day + 1}: player ${army.attackerId}'s army destroyed player ${defender.id}'s ${tb.type}.`);
        }
      }
      toRemove.push(i);
    }

    for (let i = toRemove.length - 1; i >= 0; i--) {
      state.armies.splice(toRemove[i]!, 1);
    }
  }
}
