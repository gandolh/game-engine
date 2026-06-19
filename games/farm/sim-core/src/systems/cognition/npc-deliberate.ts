import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../../components";
import { getNpcBehavior, npcRoleOf } from "../../agents/npc-behaviors";

export class NpcDeliberateSystem implements System {
  readonly name = "NpcDeliberateSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(ctx: SimContext): void {
    for (const e of this.world.query("workNpc")) {
      const role = npcRoleOf(e);
      if (role === null) continue; 
      const fn = getNpcBehavior(role);
      if (!fn) continue;
      e.workNpc.busyFactor = fn(e, { world: this.world, tick: ctx.tick });
    }
  }
}
