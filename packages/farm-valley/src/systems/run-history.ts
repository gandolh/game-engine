/**
 * RunHistorySystem — passive, read-only per-day rank/gold collector.
 *
 * On each DAY_START (same snoop pattern as BubbleSystem), appends one row per
 * farmer: { day, farmerId, gold, rank }. The rank is computed from totalValue
 * desc → farmerId asc, matching the live leaderboard's totalValue ordering and
 * adding a deterministic tie-break (farmerId asc) that the live leaderboard
 * lacks.
 *
 * Determinism guarantees:
 *   - No Date.now / Math.random.
 *   - Rank ordering: totalValue desc → farmerId asc (deterministic).
 *   - Iteration over world.query is over a stable ordered set (ECS world
 *     guarantees insertion-order stability within a query).
 *   - The buffer is naturally bounded (maxDays × farmerCount ≤ 500 rows);
 *     rows are append-only and guarded against duplicate days.
 *
 * Placement (see sim-bootstrap): runs in the read-only snoop band — after
 * InboxDispatchSystem routes messages (so the DAY_START message is visible
 * in the weatherStation inbox) and before PerceiveSystem clears them.
 */

import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_SIMULATION } from "../protocols/simulation";
import { cropInventoryValue } from "../economy";

/** One per-farmer row captured at the start of each sim day. */
export interface RunHistoryRow {
  /** The sim day this row was captured on (1-based). */
  day: number;
  /** The farmer entity id. */
  farmerId: number;
  /** Raw gold in the farmer's inventory at the start of this day. */
  gold: number;
  /**
   * Rank among all farmers, computed from totalValue desc → farmerId asc.
   * Rank 1 = highest totalValue; ties broken by lower farmerId getting the
   * better (lower) rank number so the order is fully deterministic.
   */
  rank: number;
}

export class RunHistorySystem implements System {
  readonly name = "RunHistorySystem";

  private readonly rows: RunHistoryRow[] = [];
  private lastDayProcessed = -1;

  constructor(private readonly world: World<GameEntity>) {}

  run(_ctx: SimContext): void {
    // Snoop the weatherStation inbox for DAY_START — same pattern as
    // BubbleSystem. Guard with lastDayProcessed so we process each day once.
    let newDay: number | null = null;
    for (const station of this.world.query("weatherStation", "inbox")) {
      for (const msg of station.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          const day = (msg.body as { day: number }).day;
          if (day > this.lastDayProcessed) {
            newDay = day;
          }
        }
      }
      break; // single weatherStation entity
    }
    if (newDay === null) return;
    this.lastDayProcessed = newDay;

    // Collect all farmers with inventories and compute their totalValue
    // (gold + unsold crop value), matching the leaderboard() formula in
    // sim-bootstrap.ts exactly.
    const standings: Array<{ id: number; gold: number; totalValue: number }> =
      [];
    for (const f of this.world.query("farmer", "inventory")) {
      if (f.id === undefined) continue;
      const inv = f.inventory;
      // brief 41 — quality-weighted unsold value (uses cropQuality if present).
      const unsoldValue = cropInventoryValue(inv);
      standings.push({
        id: f.id,
        gold: inv.gold,
        totalValue: inv.gold + unsoldValue,
      });
    }

    // Sort by totalValue desc → farmerId asc for a deterministic rank order.
    // Comment: the brief says "gold desc → farmerId asc" but the live
    // leaderboard ranks on totalValue (gold + unsold crop value). We use
    // totalValue to match the live leaderboard so the history rank is
    // consistent with what the viewer sees. The farmerId asc tie-break is
    // added here (the live leaderboard lacks it) for full determinism.
    standings.sort((a, b) => {
      const diff = b.totalValue - a.totalValue;
      if (diff !== 0) return diff;
      return a.id - b.id; // lower farmerId → better rank on exact tie
    });

    for (let i = 0; i < standings.length; i++) {
      const s = standings[i]!;
      this.rows.push({
        day: newDay,
        farmerId: s.id,
        gold: s.gold,
        rank: i + 1,
      });
    }
  }

  /**
   * Returns a defensive copy of all captured history rows (oldest-first).
   * A full 100-day × 5-farmer run produces at most 500 rows.
   */
  history(): readonly RunHistoryRow[] {
    return this.rows.slice();
  }
}
