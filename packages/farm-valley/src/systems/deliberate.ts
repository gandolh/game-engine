import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { deliberateConservative } from "../agents/conservative";

export class DeliberateSystem implements System {
  readonly name = "DeliberateSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    const farmers = this.world.query("fsm", "personality", "intentions", "beliefs", "desires");
    for (const farmer of farmers) {
      if (farmer.fsm.current !== "PERCEIVE") continue;
      switch (farmer.personality.kind) {
        case "conservative":
          deliberateConservative(farmer);
          break;
        default:
          farmer.intentions.queue.length = 0;
          break;
      }
      farmer.fsm.current = "ACT";
    }
  }
}
