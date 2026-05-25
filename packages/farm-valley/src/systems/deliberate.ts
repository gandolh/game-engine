import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { getDeliberate } from "../agents/registry";

export class DeliberateSystem implements System {
  readonly name = "DeliberateSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(ctx: SimContext): void {
    const farmers = this.world.query("fsm", "personality", "intentions", "beliefs", "desires");
    for (const farmer of farmers) {
      if (farmer.fsm.current !== "PERCEIVE") continue;
      const fn = getDeliberate(farmer.personality.kind);
      if (fn) {
        fn(farmer, { tick: ctx.tick });
      } else {
        farmer.intentions.queue.length = 0;
      }
      farmer.fsm.current = "ACT";
    }
  }
}
