import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";

/**
 * Closes out one deliberation cycle: FINISH_DAY → WAIT_DAY.
 *
 * brief 27 — AP is NO LONGER refilled here. With the intra-day timeline a
 * farmer runs PERCEIVE→ACT→FINISH_DAY once PER PHASE, so refilling here would
 * top up AP every phase and defeat the daily budget. AP now refills once, on
 * the morning PHASE_START (PerceiveSystem), where the rested/unrested sleep
 * rule is applied. WAIT_DAY just means "idle until the next phase re-arms me".
 */
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
