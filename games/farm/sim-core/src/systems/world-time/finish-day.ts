import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../../components";

export class FinishDaySystem implements System {
  private readonly world: World<GameEntity>;

  readonly name = "FinishDaySystem";

  constructor(world: World<GameEntity>) {
    this.world = world;
  }

  run(_ctx: SimContext): void {
    for (const farmer of this.world.query("fsm")) {
      if (farmer.fsm.current !== "FINISH_DAY") continue;
      farmer.fsm.current = "WAIT_DAY";
    }
  }
}
