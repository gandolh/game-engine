/**
 * Household homes (chunk hollow-09a) — two pure, testable pieces:
 *
 *  - `householdLayout`: a stable ground position per household, derived
 *    entirely from snapshot DATA (never from live/moving agent positions,
 *    and never from `Math.random`) — a household's anchor is its community's
 *    territory centroid (majority vote among its member agents'
 *    `communityId`s, falling back to the grid center if unaffiliated), with
 *    a small deterministic per-household offset (a plain integer hash of its
 *    id) so homes fan out around the centroid instead of stacking. Because
 *    the anchor comes from community territory (which only changes when the
 *    COMMUNITY system's periodic pass runs, not every tick) and the offset
 *    is a pure function of the household id, a home's position stays put
 *    frame-to-frame even as its members walk around.
 *  - `homeMeshFor`: "a home grows with its family" — a house mesh whose
 *    size AND structural detail (extra window past 3 members, an attached
 *    second wing past 5) scale with household member count.
 */
import { box, gable, quad, merge, translate, type Mesh } from "@engine/core/render3d";
import type { HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import { GRID_SIZE } from "@hollow/sim-core/world";

/** A stable ground-plane position for one household. */
export interface HouseholdPosition {
  readonly x: number;
  readonly y: number;
}

// --- householdLayout ---------------------------------------------------

/** Deterministic integer hash (Murmur-ish finalizer) — NOT an `Rng` (this
 *  is render-only layout, never a sim decision), just a stable id -> bits
 *  mapping so households fan out around their community centroid instead of
 *  stacking on it. */
function hashId(id: number): number {
  let h = (id ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Per-household member-count tally, derived by grouping `snapshot.agents`
 *  by `householdId` — exposed standalone since 09b (or a HUD) may also want
 *  household sizes without recomputing layout. */
export function householdMemberCounts(snapshot: HollowSnapshot): Map<number, number> {
  const counts = new Map<number, number>();
  for (const agent of snapshot.agents) {
    if (agent.householdId == null) continue;
    counts.set(agent.householdId, (counts.get(agent.householdId) ?? 0) + 1);
  }
  return counts;
}

/** A stable ground position per household id present in `snapshot`. Pure —
 *  calling this twice on two snapshots with identical `agents`/`communities`
 *  content (even different object instances) yields identical positions. */
export function householdLayout(snapshot: HollowSnapshot): Map<number, HouseholdPosition> {
  // Community territory centroids — a household's default "neighborhood".
  const centroids = new Map<number, HouseholdPosition>();
  for (const c of snapshot.communities) {
    if (c.territory.length === 0) continue;
    let sx = 0;
    let sy = 0;
    for (const t of c.territory) {
      sx += t.gx;
      sy += t.gy;
    }
    centroids.set(c.id, { x: sx / c.territory.length, y: sy / c.territory.length });
  }

  // Which community each household is affiliated with — majority vote among
  // its member agents' current `communityId`, ties broken by lowest id
  // (scanned in ascending-id order so the result never depends on
  // insertion/iteration order).
  const votesByHousehold = new Map<number, Map<number, number>>();
  const householdIds = new Set<number>();
  for (const agent of snapshot.agents) {
    if (agent.householdId == null) continue;
    householdIds.add(agent.householdId);
    if (agent.communityId == null) continue;
    let votes = votesByHousehold.get(agent.householdId);
    if (!votes) {
      votes = new Map();
      votesByHousehold.set(agent.householdId, votes);
    }
    votes.set(agent.communityId, (votes.get(agent.communityId) ?? 0) + 1);
  }

  const layout = new Map<number, HouseholdPosition>();
  for (const householdId of householdIds) {
    let anchor: HouseholdPosition = { x: GRID_SIZE / 2, y: GRID_SIZE / 2 };
    const votes = votesByHousehold.get(householdId);
    if (votes && votes.size > 0) {
      const sorted = [...votes.entries()].sort((a, b) => a[0] - b[0]);
      let bestId = sorted[0]![0];
      let bestCount = sorted[0]![1];
      for (const [cid, count] of sorted) {
        if (count > bestCount) {
          bestCount = count;
          bestId = cid;
        }
      }
      const centroid = centroids.get(bestId);
      if (centroid) anchor = centroid;
    }

    const h = hashId(householdId);
    const angle = ((h % 3600) / 3600) * Math.PI * 2;
    const radius = 2.5 + ((h >>> 12) % 8);
    layout.set(householdId, {
      x: anchor.x + Math.cos(angle) * radius,
      y: anchor.y + Math.sin(angle) * radius,
    });
  }
  return layout;
}

// --- homeMeshFor ---------------------------------------------------------

const BASE_W = 3;
const BASE_D = 2.4;
const BASE_WALL_H = 2.2;
const BASE_ROOF_H = 1.3;
const GROWTH_PER_MEMBER = 0.16;
const MAX_GROWTH_MEMBERS = 6;

/** Growth factor for a household of `memberCount` members, clamped past
 *  `MAX_GROWTH_MEMBERS` so a very large household still gets a cozy house,
 *  not an absurd mansion. `memberCount` is floored at 1 defensively (a
 *  household always has at least two partners in practice). */
function growthFactorFor(memberCount: number): number {
  const n = Math.max(1, Math.min(memberCount, MAX_GROWTH_MEMBERS));
  return 1 + (n - 1) * GROWTH_PER_MEMBER;
}

/** A small glowing window quad on the house's -y wall face, centered at
 *  local x-offset `dx`, mirroring the render3d-demo's window idiom. */
function windowQuad(wallH: number, dx: number): Mesh {
  const size = 0.5;
  const eps = 0.02;
  const wz = wallH / 2 - size / 2;
  return quad(
    [dx - size / 2, -eps, wz],
    [dx + size / 2, -eps, wz],
    [dx + size / 2, -eps, wz + size],
    [dx - size / 2, -eps, wz + size],
    "window",
  );
}

/**
 * Build a house mesh sized + detailed by household member count ("a home
 * grows with its family" — chunk hollow-09a). A bigger household gets both a
 * LARGER footprint (via `growthFactorFor`) and more structural detail: a
 * second window past 3 members, an attached second wing past 5 — so the
 * growth is observable both by `boundsOf` extent and by triangle count. Pure
 * + deterministic (no RNG) — material keys ("wood"/"woodDark"/"roof"/
 * "window") are the generic string keys `world-meshes.ts`'s material table
 * resolves at upload time.
 */
export function homeMeshFor(memberCount: number): Mesh {
  const g = growthFactorFor(memberCount);
  const w = BASE_W * g;
  const d = BASE_D * g;
  const wallH = BASE_WALL_H * g;
  const roofH = BASE_ROOF_H * g;

  const walls = box([w, d, wallH], "wood");
  const roof = translate(gable([w, d, roofH], "x", "roof"), [0, 0, wallH]);
  const parts: Mesh[] = [walls, roof, windowQuad(wallH, -w / 4)];

  if (memberCount >= 3) {
    parts.push(windowQuad(wallH, w / 4));
  }
  if (memberCount >= 5) {
    const wingW = w * 0.55;
    const wingD = d * 0.55;
    const wingWallH = wallH * 0.8;
    const wingRoofH = roofH * 0.8;
    const wing = translate(
      merge(
        box([wingW, wingD, wingWallH], "woodDark"),
        translate(gable([wingW, wingD, wingRoofH], "x", "roof"), [0, 0, wingWallH]),
      ),
      [w + 0.2, (d - wingD) / 2, 0],
    );
    parts.push(wing);
  }

  return merge(...parts);
}
