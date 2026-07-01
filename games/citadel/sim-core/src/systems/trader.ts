/**
 * TraderSystem — player-driven trading post (cozy-pivot Phase G).
 *
 * There is NO autonomous caravan any more: no schedule, no arrive/depart, no RNG.
 * The Trading Post is the player's window to the outside world. Whenever the
 * player owns a Trading Post that is staffed (workerCount>0) and connected, a
 * small, DETERMINISTIC menu of trade offers is available; the player picks one
 * via the "trade" command and the staffed trader villager executes it.
 *
 * `traderPresent` now means "the player owns a staffed, connected Trading Post"
 * (the trade affordance is available), and `traderOffers` is the fixed menu —
 * both refreshed once per in-game day so the client contract is unchanged.
 *
 * Determinism: offers are a pure function of the player's current stockpiles
 * (rank goods, give the most plentiful, receive the scarcest, at a fixed rate).
 * No `rng.fork` — this system was the only consumer of the old "trader" stream.
 *
 * Stage: "trader" (after production so stockpiles are fresh; before immigration).
 */
import type { System, SimContext } from "@engine/core";
import type { SimState, PlayerState, BarterOffer } from "../sim-state";
import type { GoodType } from "../entities/building";

/**
 * Goods the trading post will deal in. Ranked by the player's current stock to
 * build a scarcity-responsive menu (give plentiful, receive scarce).
 */
const TRADEABLE: readonly GoodType[] = ["grain", "flour", "bread", "wood", "stone", "planks", "tools"];

/** Cozy "tiny menus": at most this many offers on the board at once. */
const MAX_OFFERS = 3;
/** Fixed barter rate — give this many of a plentiful good... */
const GIVE_QTY = 5;
/** ...to receive this many of a scarce good. */
const RECEIVE_QTY = 3;

export class TraderSystem implements System {
  readonly name = "TraderSystem";

  constructor(
    private readonly state: SimState,
    private readonly ticksPerDay: number,
  ) {}

  run(ctx: SimContext): void {
    if (ctx.tick === 0 || ctx.tick % this.ticksPerDay !== 0) return;

    // Per-player: a trading post is "open" (traderPresent) when the player owns
    // one that is staffed AND connected. Iterated in stable player-id order.
    for (const p of this.state.players) {
      const open = this._hasOpenTradingPost(p);
      p.traderPresent = open;
      p.traderOffers.length = 0;
      if (open) {
        for (const offer of this._offers(p)) p.traderOffers.push(offer);
      }
    }
  }

  /** True iff `p` owns a Trading Post whose runtime state is staffed + connected. */
  private _hasOpenTradingPost(p: PlayerState): boolean {
    for (const entity of this.state.buildingWorld.query("building")) {
      const b = entity.building;
      if (b.ownerId !== p.id || b.type !== "tradingpost") continue;
      if (entity.id === undefined) continue;
      const rs = this.state.buildingState.get(entity.id);
      if (rs !== undefined && rs.connected && rs.workerCount > 0) return true;
    }
    return false;
  }

  /**
   * Build a stable, deterministic menu: rank goods by current stock, offer to
   * receive the scarcest goods in exchange for the most plentiful, at a fixed
   * rate. No RNG — purely a function of the stockpiles. Tie-break by TRADEABLE
   * order so the menu is stable across ticks with equal stock.
   */
  private _offers(p: PlayerState): BarterOffer[] {
    const ranked = [...TRADEABLE].sort((a, b) => {
      const d = p.stockpiles[a] - p.stockpiles[b];
      return d !== 0 ? d : TRADEABLE.indexOf(a) - TRADEABLE.indexOf(b);
    });
    const plentiful = [...ranked].reverse(); // highest stock first → player GIVES
    const scarce = ranked;                    // lowest stock first  → player RECEIVES

    const offers: BarterOffer[] = [];
    for (let i = 0; i < MAX_OFFERS; i++) {
      const give = plentiful[i]!;
      const receive = scarce[i]!;
      if (give === receive) continue; // degenerate (flat stockpiles) — skip
      offers.push({ give, giveQty: GIVE_QTY, receive, receiveQty: RECEIVE_QTY });
    }
    // Fallback if everything was degenerate (e.g. flat/empty stockpiles): a single
    // sensible default so an open trading post always shows at least one offer.
    if (offers.length === 0) {
      offers.push({ give: "grain", giveQty: GIVE_QTY, receive: "bread", receiveQty: RECEIVE_QTY });
    }
    return offers;
  }
}
