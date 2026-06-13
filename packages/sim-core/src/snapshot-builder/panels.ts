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

export function buildFinalStandings(summaries: FarmerSummary[]): FinalStandingRow[] {
  return summaries.map((summary, index) => ({
    rank: index + 1,
    id: summary.id,
    name: summary.name,
    personality: summary.personality,
    gold: summary.gold,
    unsoldValue: summary.unsoldValue,
    totalValue: summary.totalValue,
    crops: { ...summary.crops },
  }));
}

/**
 * Build the relationship matrix. Missing trust entries fall back to 0.5 baseline
 * (same convention as applyTrustDelta in trust.ts).
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
  farmerList.sort((a, b) => a.id - b.id);

  const farmers = farmerList.map((f) => ({ id: f.id, name: f.name, personality: f.personality }));

  const trust: Record<number, Record<number, number>> = {};
  for (const from of farmerList) {
    trust[from.id] = {};
    for (const to of farmerList) {
      if (from.id === to.id) {
        trust[from.id]![to.id] = 1.0; // diagonal: self-trust sentinel for blank cell rendering
      } else {
        trust[from.id]![to.id] = from.entity.trust?.byId.get(to.id) ?? 0.5;
      }
    }
  }

  return { farmers, trust };
}

/** Build active rivalries list from RivalrySystem with resolved farmer names. Returns [] if no system. */
export function buildRivalriesData(
  rivalrySystem: RivalrySystem | undefined,
): SnapshotRivalry[] {
  if (!rivalrySystem) return [];
  const out: SnapshotRivalry[] = [];

  // activeRivalries() is directional and may contain both A->B and B->A. Collapse
  // to one display line per undirected pair, keeping the lower-trust direction
  // (the stronger grudge) as the displayed accuser.
  const byPair = new Map<string, { aId: number; bId: number; score: number }>();
  for (const r of rivalrySystem.activeRivalries()) {
    const lo = r.aId < r.bId ? r.aId : r.bId;
    const hi = r.aId < r.bId ? r.bId : r.aId;
    const key = `${lo}:${hi}`;
    const existing = byPair.get(key);
    if (!existing || r.score < existing.score) {
      byPair.set(key, { aId: r.aId, bId: r.bId, score: r.score });
    }
  }
  for (const r of byPair.values()) {
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
  out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "rivalry" ? -1 : 1;
    const ka = `${a.aId}:${a.bId}`;
    const kb = `${b.aId}:${b.bId}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return out;
}

export function buildWealthSeries(
  world: World<GameEntity>,
  runHistoryRows: readonly RunHistoryRow[],
): SnapshotWealthSeries[] {
  const farmerMeta = new Map<number, { name: string; personality: string }>();
  for (const f of world.query("farmer", "personality")) {
    if (f.id === undefined) continue;
    farmerMeta.set(f.id, { name: f.farmer.name, personality: f.personality.kind });
  }

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
