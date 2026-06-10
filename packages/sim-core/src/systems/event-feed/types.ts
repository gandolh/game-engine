/** A single formatted feed entry. Internally the list is newest-LAST. */
export interface EventEntry {
  tick: number;
  day: number;
  text: string;
  key: string; // stable per-event identity for dedup + intra-tick ordering
  drama: number; // [0,1] — set by dramaScore() for every entry
  farmerId?: number | null; // primary farmer involved (null when not identifiable)
}

/** Minimal TRADE_COMPLETED body shape we narrate (mirrors TrustSystem). */
export interface TradeCompletedBody {
  offerId?: string;
  buyerId?: number;
  sellerId?: number;
  crop?: string;
  quantity?: number;
  pricePerUnit?: number;
}

export const EVENT_FEED_CAP = 50; // panel shows ~30; extra buffer for drama ranking
