import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { getNpcBehavior, npcRoleOf } from "../agents/npc-behaviors";

// Stamps busyFactor on each work NPC from its service role behavior.
// Pure function of world state, no RNG. WorkNpcSystem scales patrol cadence by it.
export class NpcDeliberateSystem implements System {
  readonly name = "NpcDeliberateSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(ctx: SimContext): void {
    for (const e of this.world.query("workNpc")) {
      const role = npcRoleOf(e);
      if (role === null) continue; // ambient NPC with no service role → baseline patrol
      const fn = getNpcBehavior(role);
      if (!fn) continue;
      e.workNpc.busyFactor = fn(e, { world: this.world, tick: ctx.tick });
    }
  }
}
