/**
 * snapshot-builder/panels.ts — leaderboard, final standings, relationships,
 * rivalries, and wealth series.
 */

import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import type { FarmerSummary } from "../sim-bootstrap";
import type { LeaderboardRow } from "../snapshot/ui-types";
import type {
  FinalStandingRow,
  RelationshipMatrixData,
  SnapshotRivalry,
  SnapshotWealthSeries,
} from "../snapshot";
import type { RunHistoryRow } from "../systems/run-history";
import type { RivalrySystem } from "../systems/rivalry";
import { MAX_WEALTH_ROWS } from "./constants";

// ---------------------------------------------------------------------------
// Leaderboard rows (mirrors buildLeaderboardRows in main.ts)
// ---------------------------------------------------------------------------

export function buildLeaderboardRows(summaries: FarmerSummary[]): LeaderboardRow[] {
  return summaries.map((summary, index) => ({
    rank: index + 1,
    id: summary.id,
    name: summary.name,
    personality: summary.personality,
    gold: summary.gold,
    unsoldValue: summary.unsoldValue,
    totalValue: summary.totalValue,
  }));
}

// ---------------------------------------------------------------------------
// Final standings (leaderboard + crop counts for game-over panel)
// ---------------------------------------------------------------------------

export function buildFinalStandings(summaries: FarmerSummary[]): FinalStandingRow[] {
  return summaries.map((summary, index) => ({
    rank: index + 1,
    id: summary.id,
    name: summary.name,
    personality: summary.personality,
    gold: summary.gold,
    unsoldValue: summary.unsoldValue,
    totalValue: summary.totalValue,
    // brief 41 — forward the sparse crop map from FarmerSummary.
    crops: { ...summary.crops },
  }));
}

// ---------------------------------------------------------------------------
// Relationship matrix (brief 37)
// ---------------------------------------------------------------------------

/**
 * Build the relationship matrix data from the current farmer trust states.
 * Missing trust entries fall back to the baseline 0.5 (same convention as
 * applyTrustDelta in trust.ts).
 */
export function buildRelationshipsData(world: World<GameEntity>): RelationshipMatrixData {
  const farmerList: Array<{ id: number; name: string; personality: string; entity: GameEntity }> = [];
  for (const f of world.query("farmer", "personality")) {
    if (f.id === undefined) continue;
    farmerList.push({
      id: f.id,
      name: f.farmer.name,
      personality: f.personality.kind,
      entity: f,
    });
  }
  // Sort by id for a deterministic, stable order.
  farmerList.sort((a, b) => a.id - b.id);

  const farmers = farmerList.map((f) => ({ id: f.id, name: f.name, personality: f.personality }));

  const trust: Record<number, Record<number, number>> = {};
  for (const from of farmerList) {
    trust[from.id] = {};
    for (const to of farmerList) {
      if (from.id === to.id) {
        // Diagonal: self-trust is not meaningful; use 1.0 as a sentinel so the
        // panel can render it as a blank/diagonal cell.
        trust[from.id]![to.id] = 1.0;
      } else {
        trust[from.id]![to.id] = from.entity.trust?.byId.get(to.id) ?? 0.5;
      }
    }
  }

  return { farmers, trust };
}

/**
 * Build the active rivalries list from the RivalrySystem, with resolved farmer
 * names included for the main thread. Returns [] if no rivalry system.
 */
export function buildRivalriesData(
  rivalrySystem: RivalrySystem | undefined,
): SnapshotRivalry[] {
  if (!rivalrySystem) return [];
  const out: SnapshotRivalry[] = [];

  for (const r of rivalrySystem.activeRivalries()) {
    out.push({
      aId: r.aId,
      bId: r.bId,
      aName: rivalrySystem.nameOf(r.aId),
      bName: rivalrySystem.nameOf(r.bId),
      score: r.score,
      kind: "rivalry",
    });
  }
  for (const a of rivalrySystem.activeAlliances()) {
    out.push({
      aId: a.aId,
      bId: a.bId,
      aName: rivalrySystem.nameOf(a.aId),
      bName: rivalrySystem.nameOf(a.bId),
      score: 0,
      kind: "alliance",
    });
  }
  // Sort by kind (rivalry first) then by pair key.
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "rivalry" ? -1 : 1;
    const ka = `${a.aId}:${a.bId}`;
    const kb = `${b.aId}:${b.bId}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Wealth series (brief 39)
// ---------------------------------------------------------------------------

export function buildWealthSeries(
  world: World<GameEntity>,
  runHistoryRows: readonly RunHistoryRow[],
): SnapshotWealthSeries[] {
  // Resolve farmer names + personalities from the ECS world (deterministic id order).
  const farmerMeta = new Map<number, { name: string; personality: string }>();
  for (const f of world.query("farmer", "personality")) {
    if (f.id === undefined) continue;
    farmerMeta.set(f.id, { name: f.farmer.name, personality: f.personality.kind });
  }

  // Group run-history rows by farmerId, respecting the MAX_WEALTH_ROWS cap.
  const byFarmer = new Map<number, RunHistoryRow[]>();
  let total = 0;
  for (const row of runHistoryRows) {
    if (total >= MAX_WEALTH_ROWS) break;
    let bucket = byFarmer.get(row.farmerId);
    if (bucket === undefined) {
      bucket = [];
      byFarmer.set(row.farmerId, bucket);
    }
    bucket.push(row);
    total += 1;
  }

  // Build the output in deterministic farmer-id order.
  const farmerIds = [...byFarmer.keys()].sort((a, b) => a - b);
  return farmerIds.map((id) => {
    const meta = farmerMeta.get(id) ?? { name: `Farmer ${id}`, personality: "conservative" };
    return {
      farmerId: id,
      name: meta.name,
      personality: meta.personality,
      rows: byFarmer.get(id) ?? [],
    };
  });
}
