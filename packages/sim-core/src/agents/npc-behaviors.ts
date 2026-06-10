/**
 * Service-NPC deliberation (Part B of the "bigger, livelier world" work).
 *
 * The village's service NPCs (shopkeeper, blacksmith, carpenter, barkeep,
 * dockmaster, miller) used to run a blind cosmetic patrol — WorkNpcSystem cycled
 * their stations at a fixed cadence regardless of what was happening around them.
 * This layer gives each a tiny per-tick *deliberation*: read the world, decide
 * how busy the NPC should look, and write a `busyFactor` onto its WorkNpc that
 * WorkNpcSystem scales its step/dwell cadence by. So the smith works faster when
 * a farmer is at the forge, the barkeep livens up when the tavern has company,
 * the dockmaster bustles while contracts are open, etc.
 *
 * This is ADDITIVE and cosmetic: the existing message-response systems
 * (CarpenterSystem, TavernSystem, HarborSystem, the shop/auction systems) are
 * untouched — they still own the actual transactions. Deliberation only changes
 * how alive the NPC *looks*.
 *
 * Determinism: every behavior is a PURE function of world state (entity queries
 * + tile positions). No Math.random / Date.now. busyFactor is recomputed from
 * scratch each tick, so it never accumulates drift.
 */

import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import { getRegion, type RegionId } from "../world/regions";

/** A role's behavior decides the NPC's activity multiplier for this tick. */
export type NpcBehaviorFn = (npc: GameEntity, ctx: NpcBehaviorContext) => number;

export interface NpcBehaviorContext {
  world: World<GameEntity>;
  tick: number;
}

const registry = new Map<string, NpcBehaviorFn>();

export function registerNpcBehavior(role: string, fn: NpcBehaviorFn): void {
  if (registry.has(role)) throw new Error(`NPC behavior already registered: ${role}`);
  registry.set(role, fn);
}

export function getNpcBehavior(role: string): NpcBehaviorFn | undefined {
  return registry.get(role);
}

/**
 * Resolve an NPC entity's role from the tag it carries. Returns null for an
 * entity that has a WorkNpc but no recognised service tag (kept generic so a
 * future ambient NPC can patrol without a behavior).
 */
export function npcRoleOf(e: GameEntity): string | null {
  if (e.blacksmith) return "blacksmith";
  if (e.carpenter) return "carpenter";
  if (e.tavern) return "tavern";
  if (e.dockmaster) return "dockmaster";
  if (e.shopkeeper) return "shopkeeper";
  if (e.mill) return "mill";
  return null;
}

// Busy/idle multipliers. <1 = faster patrol (busy); >1 = slower (idle/quiet).
const BUSY = 0.5;
const CALM = 1.0;
const IDLE = 1.6;

/** Count farmers currently standing inside a given region. */
function farmersInRegion(world: World<GameEntity>, region: RegionId): number {
  let n = 0;
  for (const f of world.query("farmer")) {
    if (f.farmer?.currentRegion === region) n++;
  }
  return n;
}

/**
 * The shared "react to company" behavior: an NPC is busy when farmers share its
 * region, calm otherwise. Used by the shopkeeper, smith, carpenter, miller and
 * barkeep — each parameterised by the region it lives in.
 */
function companyDriven(region: RegionId): NpcBehaviorFn {
  return (_npc, ctx) => (farmersInRegion(ctx.world, region) > 0 ? BUSY : CALM);
}

// ── Role registrations ───────────────────────────────────────────────────────
// Only the NPCs that actually patrol (carry a `workNpc`) get a behavior: the
// barkeep, blacksmith, carpenter, and dockmaster. The shopkeeper + miller are
// fixed-counter sprites with no patrol, so they have no busyFactor to set — a
// behavior is registered for them only if they later gain a workNpc. Each
// patrolling NPC livens up when a farmer shares its region. (Region ids are
// stable fixed-island literals; see regions.ts.)
registerNpcBehavior("tavern", companyDriven("village"));
registerNpcBehavior("blacksmith", companyDriven("blacksmith"));
registerNpcBehavior("carpenter", companyDriven("carpentry"));

// The dockmaster bustles while there are open/committed shipping contracts on
// the harbor board, and quiets to idle when the board is empty — so the harbor
// reads as busy exactly when shipping is happening.
registerNpcBehavior("dockmaster", (_npc, ctx) => {
  for (const b of ctx.world.query("harborBoard")) {
    const open = b.harborBoard.openContracts.length;
    const committed = b.harborBoard.committed.size;
    if (open + committed > 0) return BUSY;
    return IDLE;
  }
  return CALM;
});

/** Exported only so a guard test can assert the helper resolves a real region. */
export function _regionExists(id: RegionId): boolean {
  try {
    getRegion(id);
    return true;
  } catch {
    return false;
  }
}
