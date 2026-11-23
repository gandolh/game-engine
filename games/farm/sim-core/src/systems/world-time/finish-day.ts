import { enterState, type SimContext, type System, type World } from "@engine/core";
import type { GameEntity } from "../../components";

export class FinishDaySystem implements System {
  private readonly world: World<GameEntity>;

  readonly name = "FinishDaySystem";

  constructor(world: World<GameEntity>) {
    this.world = world;
  }

  run(ctx: SimContext): void {
    for (const farmer of this.world.query("fsm")) {
      if (farmer.fsm.current !== "FINISH_DAY") continue;
      enterState(farmer.fsm, "WAIT_DAY", ctx.tick);
    }
  }
}
