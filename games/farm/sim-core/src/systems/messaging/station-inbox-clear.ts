import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../../components";
import { ONT_SHOP } from "../../protocols/shop";

/**
 * Drains the inboxes of non-farmer "station" entities (market wall, shopkeeper,
 * notice board, harbor board, carpenter, blacksmith, mill, auction podium, …) at
 * the end of the tick, after every system that snoops them has run.
 *
 * Why this exists: `InboxDispatchSystem` fans every broadcast (a DAY_START, a
 * TRAVEL.ARRIVED per farmer arrival, …) into *every* entity with an inbox, but
 * `PerceiveSystem` only clears farmer inboxes (it queries `inbox`+`beliefs`+`fsm`).
 * Station inboxes therefore accumulated forever — an unbounded memory leak on the
 * long-lived server, and O(ticks × accumulated) rescans in the ~ten systems that
 * re-read them. Every station consumer is idempotent (guarded by `lastDayProcessed`
 * or a `seen` set), so dropping the messages after they have been read changes no
 * behaviour; it only stops the arrays from growing.
 *
 * Two inboxes are deliberately NOT touched here:
 *  - `weatherStation`: `WeatherSystem` reads it *before* `InboxDispatchSystem`
 *    (start of the tick) and drains it itself, so its DAY_START must survive from
 *    one tick's dispatch to the next tick's read. Clearing it here would starve it.
 *  - farmer inboxes (`beliefs` present): owned by `PerceiveSystem`.
 *
 * The blanket `.length = 0` below is a harmless no-op for `MarketSystem` and
 * `TavernSystem`'s entities: both already drain their own inbox earlier in the
 * same tick, so by the time this system runs there is nothing left for it to clear.
 *
 * The shopkeeper's `AUCTION_RESULT` messages are retained: they are a live retry
 * mechanism (settlement waits for the winner's funds across ticks). `ShopkeeperSystem`
 * already prunes them down to the still-pending ones behind its settled-auctions
 * check, so retaining every remaining `AUCTION_RESULT` here keeps the set bounded.
 */
export class StationInboxClearSystem implements System {
  readonly name = "StationInboxClearSystem";

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    // Discriminates farmers by `beliefs`, while PerceiveSystem queries
    // ("inbox","beliefs","fsm") — the two systems agree on inbox ownership only
    // because every entity with `beliefs` also has `fsm` today. A non-farmer entity
    // that ever gains `beliefs` alone would be skipped here but not owned by
    // PerceiveSystem either, and its inbox would go back to growing unbounded.
    for (const entity of this.world.query("inbox")) {
      if (entity.beliefs) continue; // farmers — PerceiveSystem owns these
      if (entity.weatherStation) continue; // WeatherSystem drains this pre-dispatch

      if (entity.shopkeeper) {
        // Keep only the pending auction-result retries ShopkeeperSystem left behind.
        entity.inbox.messages = entity.inbox.messages.filter(
          (msg) => msg.ontology === ONT_SHOP.AUCTION_RESULT,
        );
        continue;
      }

      entity.inbox.messages.length = 0;
    }
  }
}
