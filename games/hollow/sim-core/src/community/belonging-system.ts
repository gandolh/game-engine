/**
 * HollowBelongingSystem — couples HEARTH ATTENDANCE to the `belonging` need
 * (reworked chunk hollow-14c; was community-membership-coupled, hollow-04).
 * hollow-03 left `belonging` a static stub (`decayPerTick: 0`, see
 * economy/constants.ts); this system makes it real WITHOUT changing that
 * generic per-need decay rate, because the generic engine `NeedsDecaySystem`
 * can't condition on position/day-phase. Instead:
 *
 *  - an agent near the hearth (`world/grid.ts`'s `HEARTH_TILE`, within
 *    `HEARTH_ATTENDANCE_RADIUS` tiles, Chebyshev) DURING THE GATHER PHASE
 *    (`world/day-cycle.ts`'s `dayPhase`) replenishes — it attended the
 *    nightly gathering;
 *  - everyone else — mid-routine, asleep, working, or a loner who skips the
 *    hearth entirely — decays.
 *
 * This is a deliberate hollow-14 gameplay change: membership is no longer
 * the source of belonging at all (a member who skips the gathering now
 * decays exactly like a non-member who skips it; a LONER who nonetheless
 * shows up at the hearth during GATHER now replenishes, characterizing the
 * hearth as the town's actual trust/belonging engine — see the hollow-14
 * brief's "the hearth is the trust engine" resolution). Both directions use
 * `replenishNeed` (a clamped add) — decay is just a replenish with a
 * negative amount, so no engine change was needed.
 *
 * Runs in its own "BELONGING" stage, AFTER "COMMUNITY" (unchanged placement
 * — communities' territory/membership are read by OTHER systems this tick)
 * and BEFORE "NEEDS-DECAY" (which still runs its own
 * now-redundant-but-harmless `decayPerTick: 0` pass for `belonging` — all
 * the real per-tick belonging dynamics live here).
 *
 * Runs EVERY tick (not gated to a periodic interval): attendance is a
 * per-tick, per-position fact, not an event like community FORM/LEAVE.
 */
import type { SimContext, System, World } from "@engine/core";
import { replenishNeed } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { NEED_BELONGING } from "../economy";
import { HEARTH_TILE, dayPhase } from "../world";
import {
  BELONGING_ATTENDANCE_REPLENISH_PER_TICK,
  BELONGING_ABSENCE_DECAY_PER_TICK,
  HEARTH_ATTENDANCE_RADIUS,
} from "./constants";

export interface BelongingSystemOptions {
  attendanceReplenishPerTick?: number;
  absenceDecayPerTick?: number;
  /** The run's day length in ticks — needed to compute `dayPhase(ctx.tick,
   *  ticksPerDay)` and gate replenishment to the GATHER phase. Required
   *  (mirrors `HollowSimOptions.ticksPerDay`'s own non-optional shape) since
   *  there's no sane constant default for a run-specific day length. */
  ticksPerDay: number;
}

/** Chebyshev (max-of-axes) distance — same convention as
 *  `family/pairbond-system.ts`'s own proximity check. */
function chebyshevDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export class HollowBelongingSystem implements System {
  readonly name = "HollowBelongingSystem";
  private readonly replenishPerTick: number;
  private readonly decayPerTick: number;
  private readonly ticksPerDay: number;

  constructor(
    private readonly world: World<HollowEntity>,
    opts: BelongingSystemOptions,
  ) {
    this.replenishPerTick = opts.attendanceReplenishPerTick ?? BELONGING_ATTENDANCE_REPLENISH_PER_TICK;
    this.decayPerTick = opts.absenceDecayPerTick ?? BELONGING_ABSENCE_DECAY_PER_TICK;
    this.ticksPerDay = opts.ticksPerDay;
  }

  run(ctx: SimContext): void {
    const isGatherPhase = dayPhase(ctx.tick, this.ticksPerDay).phase === "gather";
    for (const entity of this.world.query("agent", "needs")) {
      const belonging = entity.needs.byKind[NEED_BELONGING];
      if (!belonging) continue;
      const attended =
        isGatherPhase &&
        chebyshevDistance(entity.agent.gx, entity.agent.gy, HEARTH_TILE.gx, HEARTH_TILE.gy) <=
          HEARTH_ATTENDANCE_RADIUS;
      if (attended) {
        replenishNeed(belonging, this.replenishPerTick);
      } else {
        replenishNeed(belonging, -this.decayPerTick);
      }
    }
  }
}
