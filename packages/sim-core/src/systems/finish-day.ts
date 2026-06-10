import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";

// AP refills once per day in PerceiveSystem morning PHASE_START, not here.
// WAIT_DAY means "idle until next phase re-arms me".
export class FinishDaySystem implements System {
  readonly name = "FinishDaySystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    for (const farmer of this.world.query("fsm")) {
      if (farmer.fsm.current !== "FINISH_DAY") continue;
      farmer.fsm.current = "WAIT_DAY";
    }
  }
}
