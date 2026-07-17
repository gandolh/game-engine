/**
 * HollowBelongingSystem — couples community membership to the `belonging`
 * need. hollow-03 left `belonging` a static stub (`decayPerTick: 0`, see
 * economy/constants.ts); this chunk makes it real WITHOUT changing that
 * generic per-need decay rate, because the generic engine `NeedsDecaySystem`
 * can't condition on community membership. Instead:
 *
 *  - a MEMBER's `belonging` replenishes every tick;
 *  - a non-member's (never joined, defected/left, excluded, or
 *    dissolved-out) `belonging` decays every tick.
 *
 * Both use `replenishNeed` (a clamped add) — decay is just a replenish with
 * a negative amount, so no engine change was needed.
 *
 * Runs in its own "BELONGING" stage, AFTER "COMMUNITY" (so it reads each
 * agent's up-to-the-tick `communityId`, including anyone who just
 * joined/left/was dissolved out THIS check) and BEFORE "NEEDS-DECAY" (which
 * still runs its own now-redundant-but-harmless `decayPerTick: 0` pass for
 * `belonging` — all the real per-tick belonging dynamics live here).
 *
 * Runs EVERY tick, not gated to the periodic community-check interval:
 * membership itself only changes on a check tick, but "members replenish /
 * non-members decay" is an ongoing per-tick state, not an event.
 */
import type { SimContext, System, World } from "@engine/core";
import { replenishNeed } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { NEED_BELONGING } from "../economy";
import { BELONGING_MEMBER_REPLENISH_PER_TICK, BELONGING_NONMEMBER_DECAY_PER_TICK } from "./constants";

export interface BelongingSystemOptions {
  memberReplenishPerTick?: number;
  nonMemberDecayPerTick?: number;
}

export class HollowBelongingSystem implements System {
  readonly name = "HollowBelongingSystem";
  private readonly replenishPerTick: number;
  private readonly decayPerTick: number;

  constructor(
    private readonly world: World<HollowEntity>,
    opts: BelongingSystemOptions = {},
  ) {
    this.replenishPerTick = opts.memberReplenishPerTick ?? BELONGING_MEMBER_REPLENISH_PER_TICK;
    this.decayPerTick = opts.nonMemberDecayPerTick ?? BELONGING_NONMEMBER_DECAY_PER_TICK;
  }

  run(_ctx: SimContext): void {
    for (const entity of this.world.query("needs", "communityId")) {
      const belonging = entity.needs.byKind[NEED_BELONGING];
      if (!belonging) continue;
      if (entity.communityId !== null) {
        replenishNeed(belonging, this.replenishPerTick);
      } else {
        replenishNeed(belonging, -this.decayPerTick);
      }
    }
  }
}
