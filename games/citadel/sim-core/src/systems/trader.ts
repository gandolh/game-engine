/**
 * TraderSystem — seeded periodic barter caravan.
 * Requires a tradingpost building.
 * Runs once per in-game day; uses rng.fork("trader") for all random decisions.
 *
 * Stage: "trader" (after production so stockpiles are fresh; before immigration).
 */
import type { System, SimContext } from "@engine/core";
import type { SimState, PlayerState, BarterOffer } from "../sim-state";
import { pushEvent } from "../sim-state";
import type { GoodType } from "../entities/building";
import type { Rng } from "@engine/core";

const TRADER_INTERVAL_DAYS = 7;
const TRADER_STAY_DAYS = 3;

/**
 * Citadel trader dynamic pricing: the caravan reads the player's stockpiles and
 * offers to BUY surpluses (give the player a scarce good for a plentiful one) and
 * SELL scarcities. Goods the player hoards trade away cheaply; goods they lack
 * cost more of the surplus — so trade is a real surplus/shortage decision instead
 * of three fixed (often strictly-worse) offers.
 */
const TRADEABLE: readonly GoodType[] = ["grain", "flour", "bread", "wood", "stone", "planks", "tools"];

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
        for (const offer of this._dynamicOffers(p)) p.traderOffers.push(offer);
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

  /**
   * Build scarcity-responsive offers: rank goods by current stock, pair the most
   * plentiful (the player GIVES) with the scarcest (the player RECEIVES). The wider
   * the surplus→scarcity gap, the better the rate. Deterministic: only a seeded
   * jitter (±1) varies the quantities, pulled in stable order.
   */
  private _dynamicOffers(p: PlayerState): BarterOffer[] {
    const ranked = [...TRADEABLE].sort((a, b) => p.stockpiles[a] - p.stockpiles[b]);
    const scarce = ranked.slice(0, 3);              // lowest stock → player wants these
    const plentiful = [...ranked].reverse().slice(0, 3); // highest stock → player gives these
    const offers: BarterOffer[] = [];
    for (let i = 0; i < 3; i++) {
      const give = plentiful[i]!;
      const receive = scarce[i]!;
      if (give === receive) continue; // degenerate (flat stockpiles) — skip
      const surplus = p.stockpiles[give];
      const want = p.stockpiles[receive];
      // Base 4-for-2; a wide gap (lots of `give`, little `receive`) sweetens the
      // received quantity. Clamp so it stays a sane small barter.
      const gap = Math.max(0, surplus - want);
      const giveQty = 4 + this.traderRng.int(0, 2);            // 4..5
      const receiveQty = Math.min(8, 2 + Math.floor(gap / 10)) + this.traderRng.int(0, 2); // 2..10
      offers.push({ give, giveQty, receive, receiveQty });
    }
    // Fallback if everything was degenerate (e.g. empty stockpiles at first arrival):
    // a single sensible default so the caravan is never empty.
    if (offers.length === 0) {
      offers.push({ give: "grain", giveQty: 5, receive: "bread", receiveQty: 2 });
    }
    return offers;
  }
}
