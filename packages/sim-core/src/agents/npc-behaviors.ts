

import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import { getRegion, type RegionId } from "../world/regions";

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

export function npcRoleOf(e: GameEntity): string | null {
  if (e.blacksmith) return "blacksmith";
  if (e.carpenter) return "carpenter";
  if (e.tavern) return "tavern";
  if (e.dockmaster) return "dockmaster";
  if (e.shopkeeper) return "shopkeeper";
  if (e.mill) return "mill";
  return null;
}

const BUSY = 0.5;
const CALM = 1.0;
const IDLE = 1.6;

function farmersInRegion(world: World<GameEntity>, region: RegionId): number {
  let n = 0;
  for (const f of world.query("farmer")) {
    if (f.farmer?.currentRegion === region) n++;
  }
  return n;
}

function companyDriven(region: RegionId): NpcBehaviorFn {
  return (_npc, ctx) => (farmersInRegion(ctx.world, region) > 0 ? BUSY : CALM);
}

registerNpcBehavior("tavern", companyDriven("village"));
registerNpcBehavior("blacksmith", companyDriven("blacksmith"));
registerNpcBehavior("carpenter", companyDriven("carpentry"));

registerNpcBehavior("dockmaster", (_npc, ctx) => {
  for (const b of ctx.world.query("harborBoard")) {
    const open = b.harborBoard.openContracts.length;
    const committed = b.harborBoard.committed.size;
    if (open + committed > 0) return BUSY;
    return IDLE;
  }
  return CALM;
});

export function _regionExists(id: RegionId): boolean {
  try {
    getRegion(id);
    return true;
  } catch {
    return false;
  }
}
