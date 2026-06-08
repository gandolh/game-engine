import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { getNpcBehavior, npcRoleOf } from "../agents/npc-behaviors";

/**
 * NpcDeliberateSystem — the service NPCs' decision step.
 *
 * For each work NPC, resolve its role, run that role's behavior against current
 * world state, and stamp the resulting `busyFactor` onto its WorkNpc.
 * WorkNpcSystem (which runs right after) scales its patrol cadence by it, so the
 * NPCs visibly react to the sim. Purely cosmetic + deterministic (pure function
 * of world state, no RNG), like WorkNpcSystem itself — but it lives in the sim
 * worker because it reads/writes sim entities.
 */
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
