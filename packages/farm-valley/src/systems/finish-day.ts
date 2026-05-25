import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";

export class FinishDaySystem implements System {
  readonly name = "FinishDaySystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    for (const farmer of this.world.query("fsm", "ap")) {
      if (farmer.fsm.current !== "FINISH_DAY") continue;
      farmer.ap.current = farmer.ap.max;
      farmer.fsm.current = "WAIT_DAY";
    }
  }
}
