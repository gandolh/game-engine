

import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../../components";
import { RIVAL_CUTOFF } from "../rivalry";
import { deliberateRivalChallenge } from "../../agents/watering/social";
import type { CombatSystem } from "./system";

export class AggressionSystem implements System {
  readonly name = "AggressionSystem";

  constructor(
    private readonly world: World<GameEntity>,
    private readonly combat: CombatSystem,
  ) {}

  run(ctx: SimContext): void {

    const byRegion = new Map<string, GameEntity[]>();
    for (const f of this.world.query("farmer", "trust")) {
      if (f.id === undefined || f.player) continue; 
      if (f.farmer?.chaseTarget) continue;           
      const region = f.farmer?.currentRegion;
      if (!region) continue;
      let list = byRegion.get(region);
      if (!list) { list = []; byRegion.set(region, list); }
      list.push(f);
    }

    for (const f of this.world.query("farmer", "trust")) {
      if (f.id === undefined || f.player || f.farmer?.chaseTarget) continue;
      const region = f.farmer?.currentRegion;
      if (!region) continue;
      const peers = byRegion.get(region);
      if (!peers) continue;

      let targetId: number | undefined;
      for (const p of peers) {
        if (p.id === undefined || p.id === f.id) continue;
        const trust = f.trust?.byId.get(p.id) ?? 0.5;
        if (trust < RIVAL_CUTOFF && (targetId === undefined || p.id < targetId)) {
          targetId = p.id;
        }
      }
      if (targetId === undefined) continue;

      if (!this.combat.canFight(f.id, targetId)) continue;
      deliberateRivalChallenge(f, targetId, ctx.tick);
    }
  }
}
