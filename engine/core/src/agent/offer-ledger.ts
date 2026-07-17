/**
 * OfferLedger — the game-agnostic bookkeeping of a contract-net-style trade
 * handshake over the message bus. It tracks in-flight offers keyed by an offer
 * id (with a TTL so abandoned offers expire), and dedupes the accept/decline
 * "handshake" replies within a single processing round so an offer resolves
 * exactly once even when both parties' inboxes are swept in the same tick.
 *
 * The payload `T` is whatever the game needs to carry an offer to settlement
 * (who, what, price, direction). This kernel owns only the lifecycle:
 * add → (accept | decline | expire) → remove. Payload semantics, message
 * shapes, and the actual transfer stay in the game.
 */

export interface PendingOffer<T> {
  offerId: string;
  payload: T;
  /** Tick the offer was recorded; drives TTL expiry. */
  tick: number;
}

export class OfferLedger<T> {
  private readonly pending = new Map<string, PendingOffer<T>>();
  private readonly resolvedThisRound = new Set<string>();

  constructor(private readonly ttlTicks: number) {}

  /** Drop offers older than the TTL. Preserves insertion order of survivors. */
  expire(now: number): void {
    for (const [id, p] of this.pending) {
      if (now - p.tick > this.ttlTicks) {
        this.pending.delete(id);
      }
    }
  }

  /** Record an offer. No-op (returns false) if the id is already tracked. */
  add(offerId: string, payload: T, tick: number): boolean {
    if (this.pending.has(offerId)) return false;
    this.pending.set(offerId, { offerId, payload, tick });
    return true;
  }

  has(offerId: string): boolean {
    return this.pending.has(offerId);
  }

  get(offerId: string): T | undefined {
    return this.pending.get(offerId)?.payload;
  }

  remove(offerId: string): boolean {
    return this.pending.delete(offerId);
  }

  get size(): number {
    return this.pending.size;
  }

  clear(): void {
    this.pending.clear();
    this.resolvedThisRound.clear();
  }

  /** Start a fresh handshake-dedup round (call once at the top of a tick). */
  beginHandshakeRound(): void {
    this.resolvedThisRound.clear();
  }

  /**
   * Claim a handshake reply for `offerId` in the current round. Returns true the
   * first time an id is seen this round, false thereafter — so a reply is acted
   * on exactly once even if it lands in multiple inboxes.
   */
  claimHandshake(offerId: string): boolean {
    if (this.resolvedThisRound.has(offerId)) return false;
    this.resolvedThisRound.add(offerId);
    return true;
  }
}
