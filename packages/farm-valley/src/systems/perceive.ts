import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION, type DayStartBody } from "../protocols";
import {
  ONT_SHOP,
  type AuctionCfpBody,
  type AuctionResultBody,
} from "../protocols/shop";

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
          if (farmer.fsm.current === "WAIT_DAY") {
            farmer.fsm.current = "PERCEIVE";
          }
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
}
