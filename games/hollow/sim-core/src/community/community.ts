/**
 * Community — a first-class, emergent grouping of agents (chunk hollow-04's
 * centerpiece). Plain data, mirroring `world/resources.ts`'s `ResourceWorld`
 * pattern (a small managed registry, not ECS entities — there is nothing
 * agent-like about a community: no FSM, no deliberation, no inbox). See
 * `registry.ts` for the query/mutation surface and `crystallize-system.ts`
 * for how communities come to exist, grow, shrink, split, merge, and
 * dissolve from the trust graph.
 *
 * No community is EVER pre-drawn: the only way a `Community` object comes
 * into being is `CommunityRegistry.form`, called exclusively by
 * `HollowCommunitySystem`'s FORM pass once a cluster of agents clears the
 * size + density thresholds on its own accumulated trust.
 */

export interface CommunityTile {
  readonly gx: number;
  readonly gy: number;
}

export interface CommunityNorms {
  /**
   * Fraction of a member's harvested goods expected to flow to the shared
   * stockpile. This chunk models the norm and the stockpile it governs
   * (with correct split/merge/dissolve transfer semantics — see
   * registry.ts/crystallize-system.ts) but does NOT wire an automatic
   * harvest-time contribution into `systems/act.ts` — that would invent an
   * economic flow ahead of hollow-06's explicit verbs. `contribute()` is
   * exposed as the mutation hook a later chunk wires up.
   */
  shareRate: number;
  /**
   * Minimum mutual trust members are expected to maintain toward the rest
   * of the community. Informational (read by tests/consumers/hollow-07's
   * eventual export) — the LEAVE dynamic uses its own dedicated
   * `COMMUNITY_LEAVE_TRUST_THRESHOLD` constant rather than this norm, so
   * per-community norm tuning can't accidentally destabilize detection.
   */
  cooperationExpectation: number;
}

export interface Community {
  readonly id: number;
  /**
   * Kept sorted ascending by agent id at ALL times — `CommunityRegistry`'s
   * mutation helpers maintain this invariant. Never iterate a Set/Map for
   * membership; this array's order IS the deterministic order (see the
   * brief's determinism note — Map/Set iteration order must never affect
   * sim output).
   */
  members: number[];
  /** Goods pooled by the community — see `CommunityRegistry.contribute`
   *  and the split (proportional)/merge (summed)/dissolve (reverted to
   *  remaining members, evenly) stockpile-transfer rules. */
  stockpile: Record<string, number>;
  /**
   * Tiles the community's members currently occupy/cluster around — kept
   * sorted (by gx then gy) and recomputed every community-system pass from
   * live member positions (see `crystallize-system.ts`'s
   * `recomputeTerritories`).
   */
  territory: CommunityTile[];
  norms: CommunityNorms;
  /** Tick this community was formed (or re-formed via a SPLIT). */
  readonly formedTick: number;
}
