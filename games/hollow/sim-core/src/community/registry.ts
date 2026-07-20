/**
 * CommunityRegistry — plain-data registry keyed by community id, mirroring
 * `world/resources.ts`'s `ResourceWorld` (communities are a small managed
 * set, not ECS entities). Owns id assignment (a simple incrementing
 * counter — deterministic with no `Rng` draw needed: unlike resource-node
 * PLACEMENT, a community's id is never used for anything gameplay-visible
 * that depends on its numeric value, only as a stable handle, so there is no
 * "genuine coin-flip" to fork for here) and the mutation helpers
 * `crystallize-system.ts`'s dynamics passes drive.
 *
 * The registry itself is agnostic about "what happens to a dissolved
 * community's stockpile" — `dissolve()` just removes it from the registry
 * and hands the caller the removed `Community` object so the DYNAMICS
 * system (which owns the members/commons reversion policy per the brief)
 * can decide.
 */
import type { Community, CommunityNorms, CommunityTile } from "./community";
import {
  COMMUNITY_DEFAULT_SHARE_RATE,
  COMMUNITY_DEFAULT_COOPERATION_EXPECTATION,
  COMMUNITY_DEFAULT_ADMISSION_POLICY,
} from "./constants";

export class CommunityRegistry {
  private readonly byId = new Map<number, Community>();
  private nextId = 1;

  /**
   * Forms a new community from `memberIds` and `territory` (both must
   * already be sorted ascending/by-tile by the caller — the registry does
   * not re-sort, so a caller that hands in an unsorted array has broken the
   * invariant itself; every call site in `crystallize-system.ts` sorts
   * before calling).
   */
  form(
    memberIds: readonly number[],
    territory: readonly CommunityTile[],
    tick: number,
    norms?: Partial<CommunityNorms>,
  ): Community {
    const community: Community = {
      id: this.nextId++,
      members: [...memberIds],
      stockpile: {},
      territory: [...territory],
      norms: {
        shareRate: norms?.shareRate ?? COMMUNITY_DEFAULT_SHARE_RATE,
        cooperationExpectation: norms?.cooperationExpectation ?? COMMUNITY_DEFAULT_COOPERATION_EXPECTATION,
        admissionPolicy: norms?.admissionPolicy ?? COMMUNITY_DEFAULT_ADMISSION_POLICY,
      },
      formedTick: tick,
      // Governance state (chunk hollow-12a) — always starts empty/null; the
      // next `HollowGovernanceSystem` pass fills both in for every extant
      // community, this brand-new one included.
      leaderId: null,
      standing: {},
    };
    this.byId.set(community.id, community);
    return community;
  }

  get(id: number): Community | undefined {
    return this.byId.get(id);
  }

  /** All communities, sorted ascending by id — the only iteration order any
   *  caller should use (never `this.byId.values()` directly, whose order is
   *  incidental Map-insertion order). */
  all(): Community[] {
    return [...this.byId.values()].sort((a, b) => a.id - b.id);
  }

  /** Inserts `agentId` into `members`, keeping the array sorted ascending.
   *  No-op if already present or the community doesn't exist. */
  addMember(communityId: number, agentId: number): void {
    const c = this.byId.get(communityId);
    if (!c || c.members.includes(agentId)) return;
    const idx = c.members.findIndex((m) => m > agentId);
    if (idx === -1) c.members.push(agentId);
    else c.members.splice(idx, 0, agentId);
  }

  /** Removes `agentId` from `members`. No-op if absent or the community
   *  doesn't exist. */
  removeMember(communityId: number, agentId: number): void {
    const c = this.byId.get(communityId);
    if (!c) return;
    const idx = c.members.indexOf(agentId);
    if (idx !== -1) c.members.splice(idx, 1);
  }

  /** Replaces the full member list wholesale — used by SPLIT/MERGE, which
   *  compute the new membership set up front rather than adding/removing
   *  one at a time. `members` must already be sorted ascending by the
   *  caller. */
  setMembers(communityId: number, members: readonly number[]): void {
    const c = this.byId.get(communityId);
    if (!c) return;
    c.members = [...members];
  }

  /** Replaces the territory wholesale. `territory` must already be sorted
   *  (by gx then gy) by the caller. */
  setTerritory(communityId: number, territory: readonly CommunityTile[]): void {
    const c = this.byId.get(communityId);
    if (!c) return;
    c.territory = [...territory];
  }

  /** Adds `amount` (>= 0) of `kind` to the community's stockpile. The
   *  mutation hook a later chunk (or a test) wires an actual contribution
   *  flow through — see community.ts's `CommunityNorms.shareRate` doc. */
  contribute(communityId: number, kind: string, amount: number): void {
    if (amount <= 0) return;
    const c = this.byId.get(communityId);
    if (!c) return;
    c.stockpile[kind] = (c.stockpile[kind] ?? 0) + amount;
  }

  /** Removes the community from the registry and returns the removed
   *  object (or `undefined` if it didn't exist) so the caller can decide
   *  what happens to its stockpile/members. */
  dissolve(communityId: number): Community | undefined {
    const c = this.byId.get(communityId);
    if (!c) return undefined;
    this.byId.delete(communityId);
    return c;
  }
}
