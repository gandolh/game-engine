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

      if (farmer.fsm.current === "FIGHTING") continue;
      if (farmer.farmer?.busyUntilTick !== undefined && ctx.tick >= farmer.farmer.busyUntilTick) {
        delete farmer.farmer.busyUntilTick;
        const phase = farmer.beliefs.data.phase as string | undefined;
        const settled = farmer.fsm.current === "WAIT_DAY";
        if (settled && phase && phase !== "night") {
          farmer.fsm.current = "PERCEIVE";
        }
      }

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

        } else if (msg.ontology === ONT_SIMULATION.PHASE_START) {
          this.handlePhaseStart(farmer, msg.body as unknown as PhaseStartBody);
        } else if (msg.ontology === ONT_SHOP.AUCTION_CFP) {
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
          const body = msg.body as unknown as BountyPostedBody;
          farmer.beliefs.data.bounty = body.bounty ?? undefined;
          farmer.beliefs.revision += 1;
        } else if (msg.ontology === ONT_TRAVEL.ARRIVED) {
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
      const open = farmer.beliefs.data.openAuction as AuctionCfpBody | undefined;
      if (open && ctx.tick >= open.closesAtTick) {
        farmer.beliefs.data.openAuction = undefined;
        farmer.beliefs.revision += 1;
      }
      farmer.inbox.messages.length = 0;
    }

    let harborOpenContracts: GameEntity["harborBoard"] = undefined;
    for (const board of this.world.query("harborBoard")) {
      harborOpenContracts = board.harborBoard;
      break;
    }
    if (harborOpenContracts) {
      const openList = harborOpenContracts.openContracts;
      for (const farmer of this.world.query("beliefs", "farmer")) {
        farmer.beliefs.data.harborOpenContracts = openList;
      }
    }
  }

  private handlePhaseStart(farmer: GameEntity, body: PhaseStartBody): void {
    if (!farmer.beliefs || !farmer.fsm) return;
    farmer.beliefs.data.phase = body.phase;
    farmer.beliefs.revision += 1;
    const settled = farmer.fsm.current === "WAIT_DAY" || farmer.fsm.current === "SLEEP";

    if (body.phase === "morning") {
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

    if (isActivePhase(body.phase) && settled) farmer.fsm.current = "PERCEIVE";
  }
}
