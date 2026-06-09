import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import {
  ONT_SIMULATION,
  type DayStartBody,
  type PhaseStartBody,
} from "../protocols";
import {
  ONT_SHOP,
  type AuctionCfpBody,
  type AuctionResultBody,
} from "../protocols/shop";
import { ONT_BOUNTY, type BountyPostedBody } from "../protocols/bounty";
import { isActivePhase, isNightPhase, type DayPhase } from "./day-phase";
import { ONT_TRAVEL, type TravelArrivedBody } from "../protocols/travel";
import { maxApForDay } from "./ap";
import { ONT_HARBOR } from "../protocols/harbor";
import { CAMP_REGION_ID } from "../world/regions";

export class PerceiveSystem implements System {
  readonly name = "PerceiveSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(ctx: SimContext): void {
    const farmers = this.world.query("inbox", "beliefs", "fsm");
    for (const farmer of farmers) {
      // Clear busyUntilTick once the work time has elapsed, allowing re-deliberation.
      if (farmer.farmer?.busyUntilTick !== undefined && ctx.tick >= farmer.farmer.busyUntilTick) {
        delete farmer.farmer.busyUntilTick;
        // Re-arm if the farmer is settled and in an active phase.
        const phase = farmer.beliefs.data.phase as string | undefined;
        const settled = farmer.fsm.current === "WAIT_DAY";
        if (settled && phase && phase !== "night") {
          farmer.fsm.current = "PERCEIVE";
        }
      }

      // brief (proximity) — strict per-tile actions need many more deliberation
      // cycles than the ~3 phase boundaries give: a farmer must walk to each
      // plot/tree/fountain, so it re-plans (walk → act → walk → act across
      // clusters) the moment it is idle and not en route. Re-arm a settled,
      // non-busy, non-travelling farmer during an active phase.
      if (
        farmer.fsm.current === "WAIT_DAY" &&
        farmer.farmer?.busyUntilTick === undefined &&
        farmer.farmer?.path === undefined
      ) {
        const livePhase = farmer.beliefs.data.phase as string | undefined;
        if (livePhase && livePhase !== "night") {
          farmer.fsm.current = "PERCEIVE";
        }
      }

      for (const msg of farmer.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          const body = msg.body as unknown as DayStartBody;
          farmer.beliefs.data.currentDay = body.day;
          farmer.beliefs.data.daysRemaining = body.daysRemaining;
          farmer.beliefs.revision += 1;
          // brief 27 — the morning PHASE_START (same tick) drives the first
          // deliberation; DAY_START no longer flips the FSM by itself.
        } else if (msg.ontology === ONT_SIMULATION.PHASE_START) {
          this.handlePhaseStart(farmer, msg.body as unknown as PhaseStartBody);
        } else if (msg.ontology === ONT_SHOP.AUCTION_CFP) {
          // brief 24 — surface the open auction into beliefs so the deliberate*
          // fns can decide whether to bid. Stored as the live CFP; cleared on
          // result or when it has closed.
          const cfp = msg.body as unknown as AuctionCfpBody;
          farmer.beliefs.data.openAuction = cfp;
          farmer.beliefs.revision += 1;
        } else if (msg.ontology === ONT_SHOP.AUCTION_RESULT) {
          const res = msg.body as unknown as AuctionResultBody;
          const open = farmer.beliefs.data.openAuction as
            | AuctionCfpBody
            | undefined;
          if (open && open.auctionId === res.auctionId) {
            farmer.beliefs.data.openAuction = undefined;
            farmer.beliefs.revision += 1;
          }
        } else if (msg.ontology === ONT_BOUNTY.POSTED) {
          // Notice-board bounty: surface today's wanted crop + premium so the
          // deliberate* fns can prioritize selling it.
          const body = msg.body as unknown as BountyPostedBody;
          farmer.beliefs.data.bounty = body.bounty ?? undefined;
          farmer.beliefs.revision += 1;
        } else if (msg.ontology === ONT_TRAVEL.ARRIVED) {
          // Re-deliberate on arrival: a farmer has just reached their destination.
          // Re-arm exactly once per arrival so they chain walk→act→walk→act across
          // plot clusters within a day. Guards: settled + active phase + not busy.
          // Deterministic — fires only when the ARRIVED message lands (1 tick after
          // TravelSystem emits it, via InboxDispatchSystem).
          const arrivedBody = msg.body as unknown as TravelArrivedBody;
          if (arrivedBody.farmerId === farmer.id) {
            const phase = farmer.beliefs.data.phase as DayPhase | undefined;
            const settled = farmer.fsm.current === "WAIT_DAY";
            if (
              settled &&
              farmer.farmer?.busyUntilTick === undefined &&
              farmer.farmer?.path === undefined &&
              phase &&
              isActivePhase(phase)
            ) {
              farmer.fsm.current = "PERCEIVE";
            }
          }
        }
      }
      // brief 24 — drop a stale open auction whose clock has run out (the
      // farmer never saw a result, e.g. nobody bid).
      const open = farmer.beliefs.data.openAuction as AuctionCfpBody | undefined;
      if (open && ctx.tick >= open.closesAtTick) {
        farmer.beliefs.data.openAuction = undefined;
        farmer.beliefs.revision += 1;
      }
      farmer.inbox.messages.length = 0;
    }

    // brief 46 — harbor open contracts: write from the board into each
    // farmer's beliefs so deliberate* helpers can read harborOpenContracts.
    // Re-writes every tick so the beliefs always reflect the live board.
    // Uses a lazy query so the cost is O(1) when no board entity exists.
    let harborOpenContracts: GameEntity["harborBoard"] = undefined;
    for (const board of this.world.query("harborBoard")) {
      harborOpenContracts = board.harborBoard;
      break; // single harbor board
    }
    if (harborOpenContracts) {
      const openList = harborOpenContracts.openContracts;
      for (const farmer of this.world.query("beliefs", "farmer")) {
        farmer.beliefs.data.harborOpenContracts = openList;
      }
    }
  }

  /**
   * brief 27 — drive the intra-day FSM off phase boundaries.
   *   morning  → refill AP (rested=max, unrested=half), then deliberate.
   *   work/evening → deliberate again (AP carries across phases; no refill).
   *   night → sleep; flag unrested if the farmer isn't home.
   * Only re-arms deliberation from a settled state (WAIT_DAY/SLEEP) so a
   * mid-cycle farmer isn't interrupted.
   */
  private handlePhaseStart(farmer: GameEntity, body: PhaseStartBody): void {
    if (!farmer.beliefs || !farmer.fsm) return;
    farmer.beliefs.data.phase = body.phase;
    farmer.beliefs.revision += 1;
    const settled = farmer.fsm.current === "WAIT_DAY" || farmer.fsm.current === "SLEEP";

    if (body.phase === "morning") {
      // New day's first activity: wake + refill the daily AP budget.
      // brief 28 — the ceiling grows +2/day; you wake to the full ceiling if
      // you slept at home, or half it if you were caught away (unrested).
      if (farmer.ap) {
        farmer.ap.max = maxApForDay(body.day);
        const rested = farmer.ap.unrested !== true;
        farmer.ap.current = rested ? farmer.ap.max : Math.floor(farmer.ap.max / 2);
        // brief 44 — the tavern day-helper boost is now applied SAME-DAY at hire
        // time (see handleHireHelp), not the morning after. `helperHiredDay`
        // survives here purely as the once-per-day cooldown marker; the new day's
        // wake naturally lets the farmer hire again (helperHiredDay !== today).
        farmer.ap.unrested = false;
        farmer.ap.away = false;
        farmer.ap.penaltyPending = false;
      }
      if (settled) farmer.fsm.current = "PERCEIVE";
      return;
    }

    if (isNightPhase(body.phase)) {
      // Nightfall: sleep. RESTED (full AP tomorrow) if the farmer is HOME, or
      // (brief 54) camped on the camping island; otherwise away → unrested
      // (halves tomorrow's AP). Camp rest is FULLY rested — same as home, no
      // partial tier. Both conditions require the farmer to have settled (no path).
      const settledTile = farmer.farmer?.path === undefined;
      const home =
        farmer.farmer?.homeRegion !== undefined &&
        farmer.farmer.currentRegion === farmer.farmer.homeRegion &&
        settledTile;
      const onCamp =
        farmer.farmer?.currentRegion === CAMP_REGION_ID && settledTile;
      const rested = home || onCamp;
      if (farmer.ap) farmer.ap.unrested = !rested;
      if (settled) farmer.fsm.current = "SLEEP";
      return;
    }

    if (isActivePhase(body.phase) && settled) {
      farmer.fsm.current = "PERCEIVE";
    }
  }
}
