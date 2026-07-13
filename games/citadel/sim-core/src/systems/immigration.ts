/**
 * ImmigrationSystem — daily population dynamics.
 *
 * Once per in-game day boundary, FOR EACH PLAYER (Citadel 28):
 *   - Consume bread for the player's population (1 bread / villager / day).
 *   - foodSurplus = bread in the player's stockpile this day minus consumption.
 *   - BOOTSTRAP: if the player's pop=0 and they have connected worker slots,
 *     spawn the first pioneer villager unconditionally.
 *   - If bread is in surplus AND there are open worker slots, spawn one immigrant.
 *   - If bread was in deficit for 3 consecutive days, remove one villager.
 *   - The player's gameOver becomes true when its population hits 0 (after >0).
 *
 * Single-player is the 1-player case → byte-identical. The day-boundary guard +
 * founding-window anchor are shared (the clock is shared); per-player "had pop"
 * and "tithed once" flags are tracked by player id. One immigration RNG fork,
 * pulled in stable player-id order, keeps solo replays identical.
 *
 * Stage: "population" (after villagers).
 */
import type { System, SimContext } from "@engine/core";
import { getProductionDef } from "../entities/building";
import type { VillagerComponent } from "../entities/villager";
import type { SimState, PlayerState } from "../sim-state";
import { pushEvent, removeOneVillager } from "../sim-state";
import type { Rng } from "@engine/core";

/** Citadel 09: fraction of each stored good siphoned to the relief reserve per day under the tithe. */
const TITHE_SIPHON_RATE = 0.1;

/**
 * Brief 100: how much of the post-founding arrival roll's variable band is decided by
 * the town's SERVICE COVERAGE rather than its happiness. The roll's total range stays
 * `0.7 .. 1.0` — this only splits the top `0.3` between the two signals, so growth
 * does not become a second, independent mechanism beside the bread gate.
 *
 * At 0.1: a perfectly-served town gains ~0.1 arrival probability per day over one
 * whose goods rot at the door. Small on purpose — the measured lever for growth is the
 * production curve (a served producer makes more food, which is what the gate reads).
 * This term exists so a *stagnant but stocked* town visibly stops attracting people,
 * which the bread gate alone never expressed.
 */
const SERVICE_ARRIVAL_WEIGHT = 0.1;

/**
 * Wave 3.5 — the immigration TRICKLE FLOOR spacing (in-game days between settlers).
 *
 * The surplus gate ({@link ImmigrationSystem}'s post-founding branch) needs a positive
 * daily bread surplus OR a full day's buffer banked. A town whose one staffed bakery
 * feeds its ~6-7 mouths break-even has NEITHER — surplus sits at ~0 and bread never
 * banks — so the gate never opens, and the second bakery it built to escape sits
 * unstaffed forever because staffing it needs the arrival the gate blocks. Left alone
 * the pop pins at 6-7 for 250+ days (23 buildings placed, bread 0): an UNRECOVERABLE
 * attractor, which violates the downside rule (#9 — every problem throttles toward a
 * floor, always recoverable; nothing ever fully stops).
 *
 * So the arrival flow throttles instead of halting: a fed town (not in deficit) with
 * housing to spare and a connected building sitting unstaffed still receives one settler
 * every N days. Deterministic day-count spacing — NO RNG roll decides it — so a town
 * with a healthy surplus behaves exactly as before (the surplus branch fires first and
 * this never engages). See the P1 todo (2026-07-11) for the full reproduction.
 */
const IMMIGRATION_TRICKLE_DAYS = 8;

/**
 * Wave 3.5 — the trickle stays OFF for this many days after a villager departs from
 * hunger. `fed` (surplus ≥ 0) already blocks it in a deficit; this grace also blocks it
 * across the oscillation right after a starvation departure, so the trickle can never
 * feed a dying town back to immortality (the `starve` scenario must still reach
 * `gameOver=true`).
 */
const TRICKLE_STARVE_GRACE_DAYS = 6;

/**
 * Wave 3.5 — does the immigration trickle floor fire this day? Pure, no RNG.
 *
 * Fires only when the normal post-founding arrival gate is STRUCTURALLY blocked
 * (`!surplusEligible`) yet the town is obviously viable-but-stuck: it is fed (not in
 * deficit today), has housing free, owns a connected building with no worker, has not
 * lost anyone to hunger recently, and the spacing has elapsed. Given `fed` and
 * `hasCapacity`, `!surplusEligible` reduces to "break-even bread with no banked buffer"
 * — exactly the deadlock signature. A town with real surplus takes the surplus branch
 * and never reaches here.
 */
export function shouldTrickleImmigrant(args: {
  hasCapacity: boolean;          // population < popCap
  unstaffedBuildings: number;    // connected producers with zero workers
  fed: boolean;                  // foodSurplus >= 0 (not in deficit today)
  surplusEligible: boolean;      // the normal post-founding arrival branch's condition
  daysSinceStarveDepart: number; // +Infinity if a hunger departure never happened
  daysSinceLastTrickle: number;  // +Infinity if the trickle has never fired
}): boolean {
  return (
    args.hasCapacity &&
    args.unstaffedBuildings > 0 &&
    args.fed &&
    !args.surplusEligible &&
    args.daysSinceStarveDepart >= TRICKLE_STARVE_GRACE_DAYS &&
    args.daysSinceLastTrickle >= IMMIGRATION_TRICKLE_DAYS
  );
}

/**
 * The post-founding arrival probability for a town at `happiness` (0..100) whose
 * producers are served at `townService` (0..1). Stays inside the original
 * `0.7 .. 1.0` band at every input: 0.7 baseline, with the top 0.3 split between
 * the two signals per {@link SERVICE_ARRIVAL_WEIGHT}. Pure.
 */
export function arrivalFactor(happiness: number, townService: number): number {
  const h = Math.max(0, Math.min(100, happiness)) / 100;
  const s = Math.max(0, Math.min(1, townService));
  return 0.7 + h * (0.3 - SERVICE_ARRIVAL_WEIGHT) + s * SERVICE_ARRIVAL_WEIGHT;
}

export class ImmigrationSystem implements System {
  readonly name = "ImmigrationSystem";

  private lastDay = -1;
  private readonly hadPopulation = new Set<number>(); // player ids that have had >0 pop
  private readonly tithedOnce = new Set<number>();     // player ids that fired the tithe event
  // Per-player founding anchor: the day this player FIRST had a connected,
  // unstaffed production building (i.e. the first day there was anything to
  // found). The founding window is measured from here, NOT from the first
  // observed sim day — otherwise the window expires during the live client's
  // multi-second page/WebGPU boot, before the player can place a connected
  // settlement, and the colony can never bootstrap off pop 0 (playtest P0,
  // 2026-06-27). In headless tests / replay this is tick-0 day, so behaviour is
  // unchanged; it only differs when building starts late (the live client).
  private readonly foundingAnchorDay = new Map<number, number>();
  // Wave 3.5 — the immigration trickle floor's two per-player day-count clocks. Both
  // are pure bookkeeping (no RNG); the trickle decision is a day-count comparison, so
  // replays stay byte-identical and a town that never trickles is untouched.
  private readonly lastTrickleDay = new Map<number, number>();       // last day a settler trickled in
  private readonly lastStarveDepartDay = new Map<number, number>();  // last day a villager left from hunger
  private readonly rng: Rng;
  private readonly cozy: boolean;

  constructor(private readonly state: SimState, opts: { cozy?: boolean } = {}) {
    this.rng = state.rng.fork("immigration");
    this.cozy = opts.cozy ?? true;
  }

  run(ctx: SimContext): void {
    const state = this.state;
    if (state.day === this.lastDay) return;
    const firstDay = this.lastDay === -1;
    this.lastDay = state.day;

    // Anchor each player's founding window to the FIRST observed day they have a
    // connected, unstaffed production building (something to found) — checked on
    // every observed day INCLUDING the baseline day, so a town built at tick 0
    // anchors to the baseline day exactly as the old global `startDay` did
    // (founding timing unchanged), while a town first built late (the live
    // client's post-boot day ~15) anchors then instead of having already missed
    // the window (playtest P0, 2026-06-27).
    for (const p of state.players) {
      if (!this.foundingAnchorDay.has(p.id) && this.hasFoundableBuilding(p)) {
        this.foundingAnchorDay.set(p.id, state.day);
      }
    }

    if (firstDay) {
      // Establish baseline; no consumption on the very first observed day.
      for (const p of state.players) p.lastDayBreadStart = p.stockpiles.bread;
      return;
    }

    // Per-player day processing in stable id order (determinism).
    for (const p of state.players) this._runDayFor(p);

    void ctx;
  }

  /** True if `p` owns at least one connected production building with no worker
   *  (i.e. there is something a founder could be sent to staff). */
  private hasFoundableBuilding(p: PlayerState): boolean {
    const state = this.state;
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      if (rs === undefined || !rs.connected) continue;
      const def = getProductionDef(entity.building.type);
      if (def === undefined || def.workerSlots <= 0) continue;
      if (rs.workerCount === 0) return true;
    }
    return false;
  }

  private _runDayFor(p: PlayerState): void {
    const state = this.state;

    // Citadel 09 — TITHE: before consumption, siphon a small % (10%, floored)
    // of stored BREAD from the player's pool into its relief reserve.
    // Brief 103 scope 2: re-pointed off the retired `tithe` decree onto the
    // SHARP path — in Challenge mode the town automatically tithes; the cozy
    // baseline never runs this branch (byte-identical by construction).
    // Bread-only: the reserve exists solely to buffer BREAD famine (the
    // starvation cushion below only ever withdraws reliefReserve.bread), so
    // tithing tools/wood/stone would bank goods the cushion never spends — a
    // purposeless tax. Keeping it to bread makes it a purposeful famine buffer.
    if (!this.cozy) {
      let siphonedAny = false;
      const take = Math.floor(p.stockpiles.bread * TITHE_SIPHON_RATE);
      if (take > 0) {
        p.stockpiles.bread -= take;
        p.reliefReserve.bread += take;
        siphonedAny = true;
      }
      if (siphonedAny && !this.tithedOnce.has(p.id)) {
        this.tithedOnce.add(p.id);
        pushEvent(state, `Day ${state.day}: the tithe fills the relief reserve.`);
      }
    }

    // Bread produced since last day boundary (before consumption).
    const breadNow = p.stockpiles.bread;

    // Consume bread for the population (1 bread/person/day).
    const consumption = p.population;
    // Brief 103 scope 2: RATIONING re-pointed off the retired `rationing` decree
    // onto an autonomous SHARP-only famine response — the 25% consumption cut
    // auto-engages only in Challenge mode AND only while in bread deficit
    // (breadNow < consumption), i.e. it is a reactive rationing order, not a
    // permanent cut. Cozy never cuts (byte-identical by construction).
    const actualConsumption = (!this.cozy && breadNow < consumption)
      ? Math.floor(consumption * 0.75)
      : consumption;
    let afterConsumption = breadNow - actualConsumption;

    // Citadel 09 — TITHE starvation cushion.
    let cushioned = 0;
    if (afterConsumption < 0 && p.reliefReserve.bread > 0) {
      const shortfall = -afterConsumption;
      cushioned = Math.min(shortfall, p.reliefReserve.bread);
      p.reliefReserve.bread -= cushioned;
      afterConsumption += cushioned;
      if (cushioned > 0) {
        pushEvent(state, `Day ${state.day}: relief reserve fed ${cushioned} bread to the hungry.`);
      }
    }

    if (afterConsumption >= 0) {
      p.stockpiles.bread = afterConsumption;
    } else {
      p.stockpiles.bread = 0;
    }
    const rawSurplus = breadNow - p.lastDayBreadStart - actualConsumption;
    p.foodSurplus = cushioned > 0 && afterConsumption >= 0 ? Math.max(0, rawSurplus + cushioned) : rawSurplus;

    // --- Unstaffed connected production buildings ---
    // One villager fully runs a building (output is per-building, gated only on
    // workerCount > 0 — see ProductionSystem); a building's *second* slot adds a
    // mouth with no extra output. So growth tracks the number of buildings with
    // ZERO workers (e.g. a freshly-placed second bakery), NOT every empty slot.
    let unstaffedBuildings = 0;
    // Brief 100 scope 2: the town's SERVICE COVERAGE — the mean rolling service EWMA
    // over its staffed producers (see BuildingRuntimeState.serviceEma). 1 = every
    // producer's output is reliably hauled away; 0 = goods are backing up at doors.
    // A pure read of state ProductionSystem already maintains; no second source of
    // truth for "is this town working", and no RNG.
    let serviceSum = 0;
    let serviceCount = 0;
    for (const entity of state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      if (rs === undefined || !rs.connected) continue;
      const def = getProductionDef(entity.building.type);
      if (def === undefined || def.workerSlots <= 0) continue;
      if (rs.workerCount === 0) unstaffedBuildings++;
      if (rs.workerCount > 0 && def.outputPerCycle > 0) {
        serviceSum += rs.serviceEma ?? 0;
        serviceCount++;
      }
    }
    // No producers yet ⇒ neutral (don't punish a town that hasn't started).
    const townService = serviceCount > 0 ? serviceSum / serviceCount : 1;

    // Founding phase. Keep arriving while production buildings sit UNSTAFFED
    // (capped by housing) — the old gate stopped once each building *type* had a
    // worker, so a second farm/bakery of an existing type never got staffed, the
    // food chain stayed at one-building throughput, broke even on bread, and
    // growth deadlocked at the founding size forever (playtest P0).
    //
    // The window is anchored (in run()) to the first observed day THIS player had
    // something to found, not the first observed sim day — so it survives the live
    // client's boot delay (playtest P0, 2026-06-27). Headless/replay build at
    // tick 0, so the anchor is the baseline day and founding timing is unchanged.
    const anchorDay = this.foundingAnchorDay.get(p.id) ?? state.day;
    const daysSinceStart = state.day - anchorDay;
    const foundingWindow = daysSinceStart <= Math.floor(state.daysPerYear / 4) + 2;
    // The very first pioneer always lands (bootstrap); further founders need some
    // bread on hand, so a starving colony stops attracting them (founders don't
    // keep marching into a town with an empty larder) — without this gate the
    // founding window endlessly refilled buildings that starvation had emptied.
    const bootstrapping = p.population === 0;
    const needsFounder =
      foundingWindow &&
      unstaffedBuildings > 0 &&
      p.population < p.popCap &&
      (bootstrapping || p.stockpiles.bread > 0);

    // Post-founding immigration: a town that isn't in deficit and either grew
    // its bread today OR has a healthy buffer banked (≥1 day of food) should
    // keep attracting immigrants. Gating on a strictly-positive *daily* surplus
    // alone deadlocked break-even-but-stocked towns (playtest P0).
    const fed = p.foodSurplus >= 0;
    const healthyBuffer = p.stockpiles.bread >= p.population;
    // The normal post-founding arrival gate. Extracted so the trickle floor below can
    // fire precisely when this is STRUCTURALLY blocked (not merely when its roll fails).
    const surplusEligible = p.population < p.popCap && fed && (p.foodSurplus > 0 || healthyBuffer);

    if (needsFounder) {
      // Each founder arrives with a small bread ration. This is load-bearing for
      // bootstrap: a fresh bread chain (farm→mill→bakery) needs all three staffed
      // before any bread flows, so the founders must survive the spin-up on
      // rations. The ration is finite, so a colony that can't get a chain running
      // still starves once rations run out. (Winter grain is now floored ~×0.5, not
      // 0, so winter alone no longer starves a working chain — cozy pivot #9.)
      this.spawnVillager(p);
      p.stockpiles.bread += 5;
      p.hungerDays = 0;
    } else if (surplusEligible) {
      // Brief 100 scope 2: arrivals track BOTH how happy the town is and how well its
      // producers are served. A well-laid town — goods moving, buffers empty — attracts
      // newcomers reliably; a poorly-connected one, whose goods rot at the door, keeps
      // its food and its happiness but stagnates.
      //
      // Deliberately a modest re-weighting of the SAME roll, not a second growth source
      // beside the bread gate: the brief warns against tuning immigration and growth
      // separately, and measurement showed the real lever is the production curve
      // (which feeds this gate its food). Both terms stay inside the original 0.7..1.0
      // band, so an already-thriving town cannot roll past certainty.
      const happinessFactor = arrivalFactor(p.happiness, townService);
      const immigrationRoll = this.rng.nextFloat();
      if (immigrationRoll < happinessFactor) {
        this.spawnVillager(p);
      }
      p.hungerDays = 0;
    } else if (p.foodSurplus < 0) {
      p.hungerDays++;
      if (p.hungerDays >= 3) {
        // Wave 3.5: the hungry villager who leaves is a REDUNDANT one (a worker on a
        // glutted-output producer), never the newest arrival — otherwise a break-even
        // town's every settler, sent to staff the idle bakery, is the one starvation drops
        // next, and the pop-6-7 attractor is unrecoverable (the P1 deadlock).
        if (removeOneVillager(state, p, { preferRedundant: true })) {
          // Wave 3.5: a hunger departure gates the trickle floor OFF for a few days
          // (TRICKLE_STARVE_GRACE_DAYS) so it can never nurse a starving town — the
          // `starve` scenario must still reach gameOver.
          this.lastStarveDepartDay.set(p.id, state.day);
          // A hungry villager moves on when the larder runs dry. In cozy mode
          // this is a gentle population throttle (an immigrant soon replaces
          // them once food flows), so the toast reads as a nudge to shore up
          // the food chain — never "starved (pop 0)" as a loss (decisions
          // #3/#5/#9). Sharp wording kept verbatim under cozy=false.
          pushEvent(state, this.cozy
            ? `Day ${state.day}: a villager left to find food (pop ${p.population}) — the larder is bare.`
            : `Day ${state.day}: a villager starved (pop ${p.population}).`);
        }
        p.hungerDays = 0;
      }
    } else if (p.stockpiles.bread === 0 && p.foodSurplus === 0) {
      // Persistent empty bread is still hunger — don't reset the counter.
    } else {
      p.hungerDays = 0;
    }

    // Wave 3.5 — the immigration trickle floor. Only OUTSIDE the founding window (the
    // founder path above owns arrivals during it, so this cannot move the seedTown /
    // grow founding baseline) and only when the surplus gate is structurally blocked:
    // one settler drips in every IMMIGRATION_TRICKLE_DAYS to a fed-but-break-even town
    // with housing free and a connected building sitting unstaffed, breaking the pop-6-7
    // attractor. The new arrival gets the same spin-up ration a founder does so it lives
    // to staff the idle building. No RNG decides it (a day-count check), so a town that
    // never trickles is byte-identical; spawnVillager's own draw only fires when a
    // settler actually arrives — see shouldTrickleImmigrant.
    if (!foundingWindow) {
      const daysSinceStarveDepart = state.day - (this.lastStarveDepartDay.get(p.id) ?? -Infinity);
      const daysSinceLastTrickle = state.day - (this.lastTrickleDay.get(p.id) ?? -Infinity);
      if (
        shouldTrickleImmigrant({
          hasCapacity: p.population < p.popCap,
          unstaffedBuildings,
          fed,
          surplusEligible,
          daysSinceStarveDepart,
          daysSinceLastTrickle,
        })
      ) {
        this.spawnVillager(p);
        this.lastTrickleDay.set(p.id, state.day);
        p.stockpiles.bread += 5;
        p.hungerDays = 0;
      }
    }

    // Low happiness: even with food, villagers may leave
    if (p.happiness < 30 && p.population > 0) {
      const departRoll = this.rng.nextFloat();
      if (departRoll < 0.2) {
        if (removeOneVillager(state, p)) {
          pushEvent(state, `Day ${state.day}: a villager left (low morale, pop ${p.population}).`);
        }
      }
    }

    p.lastDayBreadStart = p.stockpiles.bread;

    if (p.population > 0) this.hadPopulation.add(p.id);

    // Game over (for this player) only once a town that existed dies out.
    if (this.hadPopulation.has(p.id) && p.population === 0 && !p.gameOver) {
      p.gameOver = true;
      pushEvent(state, `Day ${state.day}: the town has died out.`);
    }
  }

  private spawnVillager(p: PlayerState): void {
    const state = this.state;
    // Use rng to keep a deterministic decision hook even though placement is fixed.
    this.rng.nextU32();
    const home = this.firstHousing(p);
    const id = state.nextVillagerId++;
    const v: VillagerComponent = {
      id,
      ownerId: p.id,
      homeX: home.x,
      homeY: home.y,
      workX: home.x,
      workY: home.y,
      storeX: home.x,
      storeY: home.y,
      fsm: "idle",
      pathX: [],
      pathY: [],
      pathStep: 0,
      carryGood: null,
      carryAmount: 0,
      ticksAtWork: 0,
    };
    state.villagerWorld.spawn({ villager: v });
    p.population++;
    pushEvent(state, `Day ${state.day}: an immigrant arrived (pop ${p.population}).`);
  }

  /** First house center owned by `p`, else map center. */
  private firstHousing(p: PlayerState): { x: number; y: number } {
    for (const entity of this.state.buildingWorld.query("building")) {
      if (entity.building.ownerId !== p.id) continue;
      const def = getProductionDef(entity.building.type);
      if (def?.isHousing === true) {
        const b = entity.building;
        return { x: b.x + Math.floor(b.w / 2), y: b.y + Math.floor(b.h / 2) };
      }
    }
    return { x: Math.floor(this.state.width / 2), y: Math.floor(this.state.height / 2) };
  }
}
