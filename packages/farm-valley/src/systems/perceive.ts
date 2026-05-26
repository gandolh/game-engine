import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION, type DayStartBody } from "../protocols";

export class PerceiveSystem implements System {
  readonly name = "PerceiveSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    const farmers = this.world.query("inbox", "beliefs", "fsm");
    for (const farmer of farmers) {
      for (const msg of farmer.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          const body = msg.body as unknown as DayStartBody;
          farmer.beliefs.data.currentDay = body.day;
          farmer.beliefs.data.daysRemaining = body.daysRemaining;
          farmer.beliefs.revision += 1;
          if (farmer.fsm.current === "WAIT_DAY") {
            farmer.fsm.current = "PERCEIVE";
          }
        }
      }
      farmer.inbox.messages.length = 0;
    }
  }
}
