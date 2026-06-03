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
import { isActivePhase, isNightPhase } from "./day-phase";
import { maxApForDay } from "./ap";

export class PerceiveSystem implements System {
  readonly name = "PerceiveSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(ctx: SimContext): void {
    const farmers = this.world.query("inbox", "beliefs", "fsm");
    for (const farmer of farmers) {
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
        farmer.ap.unrested = false;
        farmer.ap.away = false;
        farmer.ap.penaltyPending = false;
      }
      if (settled) farmer.fsm.current = "PERCEIVE";
      return;
    }

    if (isNightPhase(body.phase)) {
      // Nightfall: sleep. Home → rested; away → unrested (halves tomorrow's AP).
      const home =
        farmer.farmer?.homeRegion !== undefined &&
        farmer.farmer.currentRegion === farmer.farmer.homeRegion &&
        farmer.farmer.path === undefined;
      if (farmer.ap) farmer.ap.unrested = !home;
      if (settled) farmer.fsm.current = "SLEEP";
      return;
    }

    if (isActivePhase(body.phase) && settled) {
      farmer.fsm.current = "PERCEIVE";
    }
  }
}
