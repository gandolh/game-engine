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
import { pushEvent, removeOneVillager, releaseWorkersAt } from "../sim-state";
import type { GoodType } from "../entities/building";
import { getProductionDef, effectiveDefenseStrength } from "../entities/building";
import { igniteBuildingById, FIRE_WOODEN_TYPES } from "./fire-system";

/**
 * Cozy pivot Phase D (raids): goods a raider will consider pilfering, in
 * priority order. Deterministic order (not iteration-over-object) so the
 * spread across goods is stable across engines/runtimes.
 */
const COZY_PILFER_GOODS: readonly GoodType[] = ["bread", "grain", "tools", "planks", "wood", "stone", "flour"];

/** Cozy pivot Phase D: same magnitude as the sharp-path damage happiness hit. */
const COZY_RAID_HAPPINESS_DIP = 8;

/** Chance a damaging/sacking raid sets a surviving wooden building ablaze. */
const RAID_IGNITE_CHANCE = 0.4;

type SiegeResult = "repelled" | "damage" | "sacked";

/** Citadel 09: each available (conscripted) villager adds this much defense during a raid. */
const CONSCRIPTION_DEFENSE_FACTOR = 0.5;

/** Sum defenseStrength of player `p`'s defended buildings + 1 per wall adjacent to one. */
export function computeDefensiveStrength(state: SimState, p: PlayerState, cozy = true): number {
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
  // Interlock: a disease outbreak makes sick conscripts desert — the conscription
  // term is scaled down by the sick fraction of the population.
  // Brief 103 scope 2: CONSCRIPTION re-pointed off the retired `conscription`
  // decree onto the SHARP path — in Challenge mode an active raid automatically
  // calls up available villagers. Cozy never conscripts (byte-identical; the
  // `cozy` param defaults to true so any caller that omits it keeps that safe
  // cozy behavior).
  if (!cozy && p.raiders.length > 0) {
    let conscripts = Math.floor(p.population * CONSCRIPTION_DEFENSE_FACTOR);
    if (p.outbreakActive && p.population > 0) {
      const sickFrac = Math.min(1, p.sickVillagers / p.population);
      conscripts = Math.floor(conscripts * (1 - sickFrac));
    }
    total += conscripts;
  }

  // Threat consequence (defense pressure): under high threat the garrison drills
  // and walls are manned — defensive buildings gain a small effectiveness bonus
  // (up to +20% at threat 100), so rising threat both pressures AND rewards the
  // defender who invested early. Floor so the HUD number stays integer-stable.
  if (p.threatLevel > 0 && total > 0) {
    total = Math.floor(total * (1 + (p.threatLevel / 100) * 0.2));
  }

  return total;
}

/**
 * Resolve a siege as SEEDED probability bands (citadel siege-variance todo +
 * resolves the citadel-38 P3#14 dead-fork trap — the fork is now consumed).
 *
 * The defense:strength ratio picks a band; within the band we roll the seeded
 * `rng` so a player AT a threshold gets real variance (clutch defenses / unlucky
 * breaches) instead of a guaranteed fixed result. `morale` (0..100, default 100)
 * shifts the odds toward the defender as it falls — a besieging force that lost
 * its nerve (player repaired defenses mid-march) is likelier to be repelled.
 *
 * Fully deterministic: same seed + same inputs → same result.
 */
export function resolveSiege(
  raidStrength: number,
  defenseStrength: number,
  rng: Rng,
  morale = 100,
): SiegeResult {
  const ratio = defenseStrength / Math.max(1, raidStrength);
  // Morale below 100 nudges every outcome toward the defender (up to +0.25 repel).
  const moraleBonus = (100 - clamp(morale, 0, 100)) / 100 * 0.25;
  const roll = rng.nextFloat(); // single seeded draw — the fork is now load-bearing.

  // High defense (ratio ≥ 1.5): mostly repel.
  if (ratio >= 1.5) {
    return roll < 0.9 + moraleBonus * 0.4 ? "repelled" : "damage";
  }
  // Solid defense (ratio ≥ 1.0): repel-leaning, some damage.
  if (ratio >= 1.0) {
    const pRepel = 0.55 + moraleBonus;
    return roll < pRepel ? "repelled" : "damage";
  }
  // Mid defense (ratio ≥ 0.5): mostly damage, a chance to repel, a chance to fall.
  if (ratio >= 0.5) {
    const pRepel = 0.2 + moraleBonus;
    if (roll < pRepel) return "repelled";
    return roll < 0.9 ? "damage" : "sacked";
  }
  // Weak defense (ratio < 0.5): mostly sacked, but morale can still save the day.
  const pSaved = 0.15 + moraleBonus; // damage instead of sacked
  return roll < pSaved ? "damage" : "sacked";
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
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
      // Re-idle any villager stationed at the razed building before despawn.
      releaseWorkersAt(state, b.x, b.y, b.w, b.h);
      state.buildingState.delete(targetId);
      state.buildingWorld.despawn(entity);
      break;
    }
  }

  // Lose 1-2 population. Despawn the matching villager ENTITIES (not just the
  // counter) so the on-map crowd stays equal to `population` after a raid —
  // decrementing population alone left phantom villagers walking the map.
  const popLoss = 1 + rng.int(0, 2);
  for (let i = 0; i < popLoss; i++) {
    if (!removeOneVillager(state, p)) break;
  }
  p.happiness = Math.max(0, p.happiness - 8);

  // Interlock (siege→fire): a raid can set a surviving wooden building ablaze, so
  // wells/firebreaks become tactical against raids, not just accidental fires.
  if (rng.nextFloat() < RAID_IGNITE_CHANCE) {
    const woodCandidates: Array<{ id: number; type: string }> = [];
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.id === undefined || entity.building.ownerId !== p.id) continue;
      if (!FIRE_WOODEN_TYPES.has(entity.building.type)) continue;
      const fs = p.fireState.get(entity.id);
      if (fs?.burning === true || fs?.destroyed === true) continue;
      woodCandidates.push({ id: entity.id, type: entity.building.type });
    }
    if (woodCandidates.length > 0) {
      const pick = woodCandidates[rng.int(0, woodCandidates.length)]!;
      igniteBuildingById(state, p, pick.id, pick.type);
    }
  }

  state.connectivityDirty = true;
}

/**
 * Cozy pivot Phase D (raids): a raider that reaches the town pilfers some
 * stockpiled GOODS (the regenerating pool) instead of triggering the
 * destructive `resolveSiege` bands. Stronger defense (relative to the
 * raider's strength) shrinks the theft; a weak defense loses more — so wall/
 * gate/watchpost investment still visibly matters, it just changes the size
 * of the goods hit instead of gating destruction vs. survival.
 *
 * Deterministic: the only randomness is the caller-supplied seeded `rng`
 * fork (`cozy-pilfer-<playerId>-<raiderId>`); the good spread itself is a
 * fixed priority order, not a random pick, so replays are stable even if the
 * rng draw is ever dropped.
 */
function applyCozyPilfer(state: SimState, p: PlayerState, raider: RaiderState, rng: Rng): number {
  const ratio = p.defensiveStrength / Math.max(1, raider.strength);
  // Base theft scales with raid strength; defense ratio shrinks it. Floor the
  // divisor so a very strong defense can still squeeze theft toward ~0
  // rather than going negative or flipping sign.
  const baseTheft = raider.strength * 0.5;
  const defenseFactor = 1 / (1 + ratio); // strong defense (ratio big) -> factor -> 0; weak defense (ratio small) -> factor -> ~1
  // Seeded jitter (+/-20%) so identical-strength raids don't all steal the
  // exact same amount, while staying fully deterministic under the fork.
  const jitter = 0.8 + rng.nextFloat() * 0.4;
  let remaining = Math.max(0, Math.round(baseTheft * defenseFactor * jitter));

  let stolenTotal = 0;
  for (const good of COZY_PILFER_GOODS) {
    if (remaining <= 0) break;
    const have = p.stockpiles[good];
    if (have <= 0) continue;
    const take = Math.min(have, remaining);
    p.stockpiles[good] = have - take;
    remaining -= take;
    stolenTotal += take;
  }

  return stolenTotal;
}

export class SiegeResolutionSystem implements System {
  readonly name = "SiegeResolutionSystem";

  /**
   * Cozy-pivot Phase D threat-demotion flag. `true` (default): raids pilfer
   * stockpiled goods and leave (see `applyCozyPilfer`). `false`: today's
   * exact destructive path (`resolveSiege` bands -> repelled/damage/sacked),
   * byte-identical.
   */
  private readonly cozy: boolean;

  constructor(private readonly state: SimState, opts: { cozy?: boolean } = {}) {
    this.cozy = opts.cozy ?? true;
  }

  run(_ctx: SimContext): void {
    const state = this.state;

    // Citadel 28: resolve each player's siege independently (stable id order).
    for (const p of state.players) {
      // Defensive strength is always kept current (for HUD even with no raiders).
      p.defensiveStrength = computeDefensiveStrength(state, p, this.cozy);

      if (p.raiders.length === 0) continue;

      const toRemove: number[] = [];
      for (let i = 0; i < p.raiders.length; i++) {
        const raider = p.raiders[i]!;
        if (raider.resolved) { toRemove.push(i); continue; }

        // Brief 113 (cozy departure): a raider that has already pilfered and
        // is walking back off the map is not "at siege" anymore — skip morale
        // drift and the whole arrival block (no re-pilfer, no interception
        // here — that's RaiderMovementSystem's job). RaiderMovementSystem
        // marks it `resolved` when its reversed path is exhausted, and the
        // resolved-sweep above removes it on a later tick.
        if (raider.leaving === true) continue;

        // Siege-variance: morale decays while the player strengthens defenses
        // mid-march (besiegers lose nerve). Each point of defense gained since the
        // raider last "saw" the wall costs 2 morale; defense decay does not raise it.
        if (raider.morale === undefined) raider.morale = 100;
        if (raider.defenseAtSpawn === undefined) raider.defenseAtSpawn = p.defensiveStrength;
        const gained = p.defensiveStrength - raider.defenseAtSpawn;
        if (gained > 0) {
          raider.morale = Math.max(0, raider.morale - gained * 2);
          raider.defenseAtSpawn = p.defensiveStrength; // re-anchor so it's not double-counted
        }

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

        // Cozy pivot Phase D (raids, decision #4): a raid that reaches the
        // town pilfers stockpiled GOODS and leaves — it never destroys a
        // building, removes a villager, sacks the keep, or ends the game.
        // The sharp path below (resolveSiege bands -> repelled/damage/sacked)
        // is left completely untouched for cozy === false.
        if (this.cozy) {
          const stolen = applyCozyPilfer(state, p, raider, state.rng.fork(`cozy-pilfer-${p.id}-${raider.id}`));
          // Gentle happiness dip (same magnitude as the sharp damage path) —
          // the raid was unsettling even though nothing was destroyed. The
          // Phase B productivity floor picks this up and it self-recovers.
          p.happiness = Math.max(0, p.happiness - COZY_RAID_HAPPINESS_DIP);
          // Threat may still ease off on a resolved raid, gently (no repel
          // bonus size needed since nothing was actually repelled).
          p.threatLevel = Math.max(0, p.threatLevel - 5);
          if (stolen > 0) {
            pushEvent(state, `Day ${state.day + 1}: Raid ${raider.id} made off with some goods and left.`);
          } else {
            pushEvent(state, `Day ${state.day + 1}: Raid ${raider.id} found little worth taking and left.`);
          }

          // Brief 113: instead of vanishing at the keep, the raider walks
          // back off the map along the path it actually walked, reversed.
          // `path.slice(0, pathStep)` (not `path` itself) because the
          // `exhaustedAtTarget` arrival branch can have `pathStep >=
          // path.length` (a raider that ran out of route and stalled near
          // the target) — slicing to `pathStep` naturally clamps to the
          // full array in that case, so it always reverses exactly the
          // walked prefix. Edge case: a raider that arrived with an empty
          // walked prefix (e.g. spawned already adjacent to the target, so
          // it never took a step) has nothing to retrace — resolve it
          // immediately, same as today, rather than leaving it stuck with
          // an empty path.
          const walked = raider.path.slice(0, raider.pathStep).reverse();
          if (walked.length > 0) {
            raider.leaving = true;
            raider.path = walked;
            raider.pathStep = 0;
          } else {
            raider.resolved = true;
            toRemove.push(i);
          }
          continue;
        }

        const result = resolveSiege(
          raider.strength,
          p.defensiveStrength,
          state.rng.fork(`siege-${p.id}-${raider.id}`),
          raider.morale,
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
