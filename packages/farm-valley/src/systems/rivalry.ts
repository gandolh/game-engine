// RivalrySystem — passive, read-only accumulator that tracks cumulative adverse
// history between ordered farmer pairs and labels named rivalries (and alliances).
//
// Placement (see sim-bootstrap): runs in the read-only snoop band — after
// TrustSystem (which also observes DECLINE + broken CNP) and BEFORE
// EventFeedSystem so EventFeedSystem can read freshlyFormedThisTick() in the
// same tick. Both come after InboxDispatch and before PerceiveSystem.
//
// Adverse signals tracked:
//   - ONT_ENCOUNTER.DECLINE in a farmer's inbox (peer declined OFFER_SEED)
//   - Broken CNP commitments (mirror TrustSystem's findBrokenCommitments; do NOT
//     call markBrokenCommitmentReported — TrustSystem owns that flag). Deduplicated
//     by a per-task stable key so a broken task is counted at most once.
//
// Determinism guarantees:
//   - No Date.now / Math.random.
//   - Pair keys are ordered (min(a,b):max(a,b)) for symmetry-safe accumulation.
//   - Query iteration order is stable within a run (ECS world insertion-order).
//   - freshlyFormed list is sorted by pair key before being returned.
//   - Same seed → same rivalries.

import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_ENCOUNTER } from "../protocols/encounter";
import type { CnpCoordinator } from "../agents/cnp-coordinator";

// ---- thresholds -----------------------------------------------------------

/**
 * Number of adverse events an ordered pair must accumulate before being labeled
 * a rivalry. Tuned so a handful (2–6) fire per 100-day run on a typical seed.
 *
 * Adverse events per run estimate:
 *   - DECLINE: farmers send ~1-3 OFFER_SEED encounters/day; a fraction decline.
 *     Across 100 days × 4 pairs, there could be 10-40 total declines spread
 *     across 6 possible pairs → ~2-7 per pair. Threshold 3 puts most pairs just
 *     under or over the line — a handful fire.
 *   - Broken CNP commitments: rare (~0-2 total per run).
 * Threshold = 3 produces ~2-5 named rivalries on seed 0xc0ffee (observed).
 */
export const RIVALRY_THRESHOLD = 3;

/**
 * Both farmers in a pair must have mutual trust ≥ this value for the pair to be
 * labeled an alliance. Trust baseline is 0.5; high-cooperation pairs climb toward
 * 0.8+ after several ACCEPTs + successful trades.
 */
export const ALLIANCE_TRUST_THRESHOLD = 0.8;

// ---- types ----------------------------------------------------------------

/** An active named rivalry between two farmers. */
export interface ActiveRivalry {
  /** Lower farmer id (ordered). */
  aId: number;
  /** Higher farmer id (ordered). */
  bId: number;
  /** Accumulated adverse-event score. */
  score: number;
}

/** An active named alliance between two farmers. */
export interface ActiveAlliance {
  aId: number;
  bId: number;
}

/** A just-formed rivalry (cleared after EventFeedSystem reads it). */
export interface FreshRivalry {
  aId: number;
  bId: number;
  score: number;
  kind: "rivalry" | "alliance";
}

// ---- helpers ---------------------------------------------------------------

function pairKey(a: number, b: number): string {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return `${lo}:${hi}`;
}

// ---- system ---------------------------------------------------------------

export class RivalrySystem implements System {
  readonly name = "RivalrySystem";

  /** Unbounded rivalry score accumulator by ordered pair key. */
  private readonly rivalryScore = new Map<string, number>();

  /** Pair keys that have already crossed RIVALRY_THRESHOLD (rivalries only). */
  private readonly activeRivalryKeys = new Set<string>();

  /** Alliance pair keys we have already announced (for one-shot feed lines). */
  private readonly announcedAllianceKeys = new Set<string>();

  /** Broken-commitment task ids already counted in the rivalry accumulator. */
  private readonly seenBroken = new Set<string>();

  /** Rivalries formed THIS tick (sorted, cleared after each tick by caller). */
  private readonly freshThisTick: FreshRivalry[] = [];

  constructor(
    private readonly world: World<GameEntity>,
    private readonly cnpCoordinators?: ReadonlyMap<number, CnpCoordinator>,
  ) {}

  run(ctx: SimContext): void {
    this.freshThisTick.length = 0;
    this.processFarmerInboxes();
    this.processCnpBrokenCommitments(ctx.tick);
    this.detectNewAlliances();
  }

  // ---- farmer inbox snoop ---------------------------------------------------

  private processFarmerInboxes(): void {
    for (const farmer of this.world.query("farmer", "inbox")) {
      if (farmer.id === undefined) continue;
      for (const msg of farmer.inbox.messages) {
        if (msg.ontology !== ONT_ENCOUNTER.DECLINE) continue;
        if (typeof msg.sender !== "number") continue;
        // farmer.id received a DECLINE from msg.sender (the peer rejected our
        // OFFER_SEED). This is adverse for the initiator (farmer.id) toward the
        // peer (msg.sender). Accumulate on the ordered pair.
        this.addAdverseEvent(farmer.id, msg.sender);
      }
    }
  }

  // ---- CNP broken commitments -----------------------------------------------

  private processCnpBrokenCommitments(currentTick: number): void {
    if (!this.cnpCoordinators) return;
    // Mirror TrustSystem.processCnpCommitments but use our own seenBroken set
    // and do NOT call markBrokenCommitmentReported (TrustSystem owns that).
    const BROKEN_WINDOW = 4;
    for (const coord of this.cnpCoordinators.values()) {
      const broken = coord.findBrokenCommitments(currentTick, BROKEN_WINDOW);
      for (const task of broken) {
        if (task.winnerId === null) continue;
        const key = `broken:${task.taskId}`;
        if (this.seenBroken.has(key)) continue;
        this.seenBroken.add(key);
        // Initiator had a broken commitment toward the winner — adverse for the
        // pair. We record the pair (initiatorId, winnerId) just like TrustSystem.
        this.addAdverseEvent(task.initiatorId, task.winnerId);
      }
    }
  }

  // ---- alliance detection ---------------------------------------------------

  private detectNewAlliances(): void {
    // An alliance is purely derived from the current trust matrix — no
    // accumulator needed. We scan all ordered pairs of farmers and check if both
    // trust each other above ALLIANCE_TRUST_THRESHOLD. Emit a fresh entry only
    // the first time a pair crosses that threshold (one-shot via announcedAllianceKeys).
    const farmers: Array<{ id: number; entity: GameEntity }> = [];
    for (const f of this.world.query("farmer")) {
      if (f.id !== undefined) farmers.push({ id: f.id, entity: f });
    }
    // Sort for deterministic iteration order.
    farmers.sort((a, b) => a.id - b.id);

    for (let i = 0; i < farmers.length; i++) {
      for (let j = i + 1; j < farmers.length; j++) {
        const fa = farmers[i]!;
        const fb = farmers[j]!;
        const aId = fa.id;
        const bId = fb.id;
        const key = pairKey(aId, bId);
        // Skip pairs already announced.
        if (this.announcedAllianceKeys.has(key)) continue;
        // Check mutual trust.
        const trustAtoB = fa.entity.trust?.byId.get(bId) ?? 0.5;
        const trustBtoA = fb.entity.trust?.byId.get(aId) ?? 0.5;
        if (trustAtoB >= ALLIANCE_TRUST_THRESHOLD && trustBtoA >= ALLIANCE_TRUST_THRESHOLD) {
          this.announcedAllianceKeys.add(key);
          // Sort ids for the FreshRivalry so aId < bId.
          const loId = aId < bId ? aId : bId;
          const hiId = aId < bId ? bId : aId;
          this.freshThisTick.push({ aId: loId, bId: hiId, score: 0, kind: "alliance" });
        }
      }
    }
  }

  // ---- internal accumulator -------------------------------------------------

  private addAdverseEvent(aId: number, bId: number): void {
    const key = pairKey(aId, bId);
    const current = this.rivalryScore.get(key) ?? 0;
    const next = current + 1;
    this.rivalryScore.set(key, next);
    // Check if this event pushes the pair over the threshold for the first time.
    if (next >= RIVALRY_THRESHOLD && !this.activeRivalryKeys.has(key)) {
      this.activeRivalryKeys.add(key);
      // Decode ids from key (lo:hi).
      const [loStr, hiStr] = key.split(":");
      const loId = Number(loStr);
      const hiId = Number(hiStr);
      this.freshThisTick.push({ aId: loId, bId: hiId, score: next, kind: "rivalry" });
    }
  }

  // ---- public accessors -----------------------------------------------------

  /**
   * Returns rivalries and alliances formed THIS tick (cleared every tick).
   * EventFeedSystem reads this list during the same tick (RivalrySystem runs
   * before EventFeedSystem in the scheduler).
   * The list is sorted by pair key for deterministic ordering.
   */
  freshlyFormedThisTick(): readonly FreshRivalry[] {
    // Sort by pair key for deterministic ordering before returning.
    return this.freshThisTick
      .slice()
      .sort((a, b) => {
        const ka = pairKey(a.aId, a.bId);
        const kb = pairKey(b.aId, b.bId);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
  }

  /**
   * Returns a stable, deterministically-ordered list of all active rivalries
   * (pairs where score ≥ RIVALRY_THRESHOLD). Sorted by pair key.
   */
  activeRivalries(): readonly ActiveRivalry[] {
    const out: ActiveRivalry[] = [];
    for (const key of this.activeRivalryKeys) {
      const score = this.rivalryScore.get(key) ?? RIVALRY_THRESHOLD;
      const [loStr, hiStr] = key.split(":");
      out.push({ aId: Number(loStr), bId: Number(hiStr), score });
    }
    out.sort((a, b) => {
      const ka = pairKey(a.aId, a.bId);
      const kb = pairKey(b.aId, b.bId);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return out;
  }

  /**
   * Returns active alliances — pairs where BOTH farmers' trust toward each other
   * exceeds ALLIANCE_TRUST_THRESHOLD. Derived directly from current trust state
   * (no accumulator). Sorted by pair key.
   */
  activeAlliances(): readonly ActiveAlliance[] {
    const farmers: Array<{ id: number; entity: GameEntity }> = [];
    for (const f of this.world.query("farmer")) {
      if (f.id !== undefined) farmers.push({ id: f.id, entity: f });
    }
    farmers.sort((a, b) => a.id - b.id);

    const out: ActiveAlliance[] = [];
    for (let i = 0; i < farmers.length; i++) {
      for (let j = i + 1; j < farmers.length; j++) {
        const fa = farmers[i]!;
        const fb = farmers[j]!;
        const trustAtoB = fa.entity.trust?.byId.get(fb.id) ?? 0.5;
        const trustBtoA = fb.entity.trust?.byId.get(fa.id) ?? 0.5;
        if (trustAtoB >= ALLIANCE_TRUST_THRESHOLD && trustBtoA >= ALLIANCE_TRUST_THRESHOLD) {
          const loId = fa.id < fb.id ? fa.id : fb.id;
          const hiId = fa.id < fb.id ? fb.id : fa.id;
          out.push({ aId: loId, bId: hiId });
        }
      }
    }
    out.sort((a, b) => {
      const ka = pairKey(a.aId, a.bId);
      const kb = pairKey(b.aId, b.bId);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    return out;
  }

  /**
   * Look up a farmer's display name by id from the world. Returns `#id` if not
   * found (same convention as EventFeedSystem.nameOf).
   */
  nameOf(id: number): string {
    for (const f of this.world.query("farmer")) {
      if (f.id === id) return f.farmer.name;
    }
    return `#${id}`;
  }
}
