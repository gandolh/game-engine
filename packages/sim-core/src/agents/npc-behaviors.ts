/**
 * Service-NPC deliberation: each NPC writes a `busyFactor` onto its WorkNpc every tick
 * (pure function of world state — no Math.random / Date.now). Cosmetic only; actual
 * transactions remain in CarpenterSystem / TavernSystem / etc.
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

/** Resolve an NPC entity's role from its component tag. Null = no known role. */
export function npcRoleOf(e: GameEntity): string | null {
  if (e.blacksmith) return "blacksmith";
  if (e.carpenter) return "carpenter";
  if (e.tavern) return "tavern";
  if (e.dockmaster) return "dockmaster";
  if (e.shopkeeper) return "shopkeeper";
  if (e.mill) return "mill";
  return null;
}

// <1 = faster patrol (busy); >1 = slower (idle/quiet).
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

/** Busy when any farmer shares the NPC's region, calm otherwise. */
function companyDriven(region: RegionId): NpcBehaviorFn {
  return (_npc, ctx) => (farmersInRegion(ctx.world, region) > 0 ? BUSY : CALM);
}

registerNpcBehavior("tavern", companyDriven("village"));
registerNpcBehavior("blacksmith", companyDriven("blacksmith"));
registerNpcBehavior("carpenter", companyDriven("carpentry"));

// Dockmaster bustles while contracts are open/committed, idles when board is empty.
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
