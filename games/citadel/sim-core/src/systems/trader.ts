/**
 * TraderSystem — seeded periodic barter caravan.
 * Requires a tradingpost building.
 * Runs once per in-game day; uses rng.fork("trader") for all random decisions.
 *
 * Stage: "trader" (after production so stockpiles are fresh; before immigration).
 */
import type { System, SimContext } from "@engine/core";
import type { SimState } from "../sim-state";
import { pushEvent } from "../sim-state";
import type { Rng } from "@engine/core";

const TRADER_INTERVAL_DAYS = 7;
const TRADER_STAY_DAYS = 3;

export class TraderSystem implements System {
  readonly name = "TraderSystem";
  private readonly traderRng: Rng;

  constructor(
    private readonly state: SimState,
    private readonly ticksPerDay: number,
  ) {
    this.traderRng = state.rng.fork("trader");
  }

  run(ctx: SimContext): void {
    if (ctx.tick === 0 || ctx.tick % this.ticksPerDay !== 0) return;

    const day = this.state.day;

    // Citadel 28: each player runs their own trading-post caravan. One shared
    // RNG stream pulled in stable player-id order → solo (player 0) unchanged.
    for (const p of this.state.players) {
      // Does THIS player own a trading post?
      let hasTradingPost = false;
      for (const entity of this.state.buildingWorld.query("building")) {
        if (entity.building.ownerId === p.id && entity.building.type === "tradingpost") {
          hasTradingPost = true;
          break;
        }
      }
      if (!hasTradingPost) continue;

      // Schedule next arrival if none pending
      if (p.traderArrivalDay === -1) {
        const jitter = this.traderRng.int(0, 3); // 0..2 day jitter
        p.traderArrivalDay = day + TRADER_INTERVAL_DAYS + jitter;
        p.traderDepartDay = p.traderArrivalDay + TRADER_STAY_DAYS;
      }

      // Caravan arrives
      if (!p.traderPresent && day >= p.traderArrivalDay) {
        p.traderPresent = true;
        p.traderOffers.length = 0;
        p.traderOffers.push(
          { give: "grain", giveQty: 5, receive: "bread",  receiveQty: 2 },
          { give: "wood",  giveQty: 4, receive: "flour",  receiveQty: 3 },
          { give: "bread", giveQty: 3, receive: "grain",  receiveQty: 8 },
        );
        pushEvent(this.state, `Day ${day}: a merchant caravan arrived at the Trading Post!`);
      }

      // Caravan departs
      if (p.traderPresent && day >= p.traderDepartDay) {
        p.traderPresent = false;
        p.traderArrivalDay = -1;
        p.traderOffers.length = 0;
        pushEvent(this.state, `Day ${day}: the merchant caravan departed.`);
      }
    }
  }
}
