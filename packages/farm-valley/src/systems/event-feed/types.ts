/** A single formatted feed entry. Internally the list is newest-LAST. */
export interface EventEntry {
  /** Sim tick the underlying message was observed on. */
  tick: number;
  /** Sim day for the "Day N —" prefix. */
  day: number;
  /** Human-readable narration line. */
  text: string;
  /** Stable per-event identity used for dedup + intra-tick ordering. */
  key: string;
  /**
   * Drama score in [0, 1]. Higher = more significant.
   * Set by dramaScore() in drama.ts for every captured entry.
   */
  drama: number;
  /**
   * The primary farmer entity id involved in this event, or null when
   * none is identifiable. Used by brief 40's zoom-to-event feature.
   * Set at capture time for events that have a clear subject (auction winner,
   * shock target, crop-death owner, rank-flip, etc.). Null for trade/accept.
   */
  farmerId?: number | null;
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

/** Internal cap — the panel shows ~30; we keep a little extra history. */
export const EVENT_FEED_CAP = 50;
