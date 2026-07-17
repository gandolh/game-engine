/**
 * HollowCommunitySystem — the PERIODIC (not every-tick) community-detection
 * + dynamics pass. Every `checkIntervalTicks` ticks it runs five
 * deterministic sub-passes, in this fixed order, over the CURRENT trust
 * ledger (this tick's `HollowTrustAccrualSystem` output — see
 * sim-bootstrap.ts's scheduler-order comment for why TRUST-ACCRUAL runs
 * immediately before this stage):
 *
 *  1. LEAVE   — a member whose average outgoing trust to the rest of its
 *               community collapses below `leaveTrustThreshold` defects.
 *               A community that drops below `minMembers` afterward
 *               DISSOLVEs (stockpile reverts to remaining members, evenly).
 *  2. SPLIT   — a community whose internal (mutual-trust) graph has
 *               fragmented below `minDensity`, but still contains >= 2
 *               dense sub-clusters each >= `minSize`, cleaves into two:
 *               the sub-cluster containing the lowest member id keeps the
 *               original id; the other becomes a brand-new community.
 *               Any additional fragments (below `minSize`, or a 3rd+
 *               qualifying cluster) are released to the unaffiliated pool
 *               rather than force-fit into one of the two halves — the
 *               FORM pass below may re-crystallize them later.
 *  3. MERGE   — two communities with high average cross-trust AND
 *               overlapping/nearby territory fuse into the lower id; at
 *               most one merge per community per pass (chains resolve over
 *               subsequent check intervals, keeping this pass O(comms^2)
 *               instead of needing a fixed point within one tick).
 *  4. GROW    — a high-trust unaffiliated agent joins an existing
 *               community (processed community-by-community, ascending id;
 *               an agent joins at most once per pass).
 *  5. FORM    — the crystallization proper: among agents STILL
 *               unaffiliated after GROW, connected components of the
 *               mutual-trust graph that clear `minSize` + `minDensity`
 *               become brand-new communities.
 *
 * Territory for every surviving community is recomputed from current
 * member positions at the end of the pass.
 *
 * Determinism: every pass sorts agent/community ids ascending before any
 * positional decision (BFS start, split-half assignment, merge partner
 * order, stockpile-remainder assignment) — see trust.ts's header for the
 * full rationale. No `Rng` fork is used or needed in this system.
 */
import type { SimContext, System, World, MessageBus } from "@engine/core";
import { PERFORMATIVE, relationshipScore } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { addGoods } from "../components";
import { ONT_COMMUNITY } from "../protocols";
import type { Community, CommunityTile } from "./community";
import { CommunityRegistry } from "./registry";
import { connectedComponents, density, distributeEvenly, mutualTrust } from "./trust";
import {
  COMMUNITY_CHECK_INTERVAL_TICKS,
  COMMUNITY_MIN_SIZE,
  COMMUNITY_MIN_MEMBERS,
  COMMUNITY_MIN_DENSITY,
  COMMUNITY_TRUST_THRESHOLD,
  COMMUNITY_JOIN_TRUST_THRESHOLD,
  COMMUNITY_LEAVE_TRUST_THRESHOLD,
  COMMUNITY_MERGE_CROSS_TRUST_THRESHOLD,
  COMMUNITY_MERGE_TERRITORY_RADIUS,
} from "./constants";

export interface CommunitySystemOptions {
  checkIntervalTicks?: number;
  minSize?: number;
  minMembers?: number;
  minDensity?: number;
  trustThreshold?: number;
  joinTrustThreshold?: number;
  leaveTrustThreshold?: number;
  mergeCrossTrustThreshold?: number;
  mergeTerritoryRadius?: number;
}

type CommunityEntity = HollowEntity & {
  id: number;
  agent: NonNullable<HollowEntity["agent"]>;
  relationships: NonNullable<HollowEntity["relationships"]>;
  inventory: NonNullable<HollowEntity["inventory"]>;
  communityId: number | null;
};

export class HollowCommunitySystem implements System {
  readonly name = "HollowCommunitySystem";

  private readonly checkIntervalTicks: number;
  private readonly minSize: number;
  private readonly minMembers: number;
  private readonly minDensity: number;
  private readonly trustThreshold: number;
  private readonly joinTrustThreshold: number;
  private readonly leaveTrustThreshold: number;
  private readonly mergeCrossTrustThreshold: number;
  private readonly mergeTerritoryRadius: number;

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly registry: CommunityRegistry,
    private readonly bus: MessageBus,
    opts: CommunitySystemOptions = {},
  ) {
    this.checkIntervalTicks = opts.checkIntervalTicks ?? COMMUNITY_CHECK_INTERVAL_TICKS;
    this.minSize = opts.minSize ?? COMMUNITY_MIN_SIZE;
    this.minMembers = opts.minMembers ?? COMMUNITY_MIN_MEMBERS;
    this.minDensity = opts.minDensity ?? COMMUNITY_MIN_DENSITY;
    this.trustThreshold = opts.trustThreshold ?? COMMUNITY_TRUST_THRESHOLD;
    this.joinTrustThreshold = opts.joinTrustThreshold ?? COMMUNITY_JOIN_TRUST_THRESHOLD;
    this.leaveTrustThreshold = opts.leaveTrustThreshold ?? COMMUNITY_LEAVE_TRUST_THRESHOLD;
    this.mergeCrossTrustThreshold = opts.mergeCrossTrustThreshold ?? COMMUNITY_MERGE_CROSS_TRUST_THRESHOLD;
    this.mergeTerritoryRadius = opts.mergeTerritoryRadius ?? COMMUNITY_MERGE_TERRITORY_RADIUS;
  }

  run(ctx: SimContext): void {
    if (ctx.tick % this.checkIntervalTicks !== 0) return;

    const byId = new Map<number, CommunityEntity>();
    for (const e of this.world.query("agent", "relationships", "inventory", "communityId")) {
      byId.set((e as CommunityEntity).id, e as CommunityEntity);
    }

    this.runLeave(ctx.tick, byId);
    this.runSplit(ctx.tick, byId);
    this.runMerge(ctx.tick, byId);
    this.runGrow(ctx.tick, byId);
    this.runForm(ctx.tick, byId);
    this.recomputeTerritories(byId);
  }

  // ---- 1. LEAVE -------------------------------------------------------

  private runLeave(tick: number, byId: Map<number, CommunityEntity>): void {
    for (const community of this.registry.all()) {
      // Snapshot the FULL roster before any removal this pass — every
      // member's "average trust to the rest of the community" is judged
      // against this same prior-tick roster, not a partially-updated one
      // that shrinks as other members are removed earlier in this loop.
      // It also lets `dissolveCommunity` report the complete former roster
      // even though `registry.removeMember` mutates `community.members` in
      // place (the same array reference `community` points at), which
      // would otherwise make "who used to be here" unrecoverable by the
      // time a resulting dissolve is evaluated below.
      const priorMembers = [...community.members];
      const toRemove: number[] = [];
      for (const memberId of priorMembers) {
        const member = byId.get(memberId);
        if (!member) continue;
        const others = priorMembers.filter((m) => m !== memberId);
        if (others.length === 0) continue;
        const avg =
          others.reduce((sum, otherId) => sum + relationshipScore(member.relationships, otherId), 0) /
          others.length;
        if (avg < this.leaveTrustThreshold) toRemove.push(memberId);
      }
      for (const memberId of toRemove) {
        this.registry.removeMember(community.id, memberId);
        const entity = byId.get(memberId);
        if (entity) entity.communityId = null;
        this.emit(ONT_COMMUNITY.LEFT, { communityId: community.id, agentId: memberId, tick }, tick);
      }
      const updated = this.registry.get(community.id);
      if (updated && updated.members.length < this.minMembers) {
        // Dissolve whenever membership drops below the floor — including
        // all the way to 0 (a community that reaches 0 members must not
        // linger as a zombie registry entry; see dissolveCommunity's
        // stockpile-reversion guard for the 0-remaining-members case).
        this.dissolveCommunity(community.id, priorMembers, updated.members, tick, byId);
      }
    }
  }

  private dissolveCommunity(
    communityId: number,
    formerMembers: readonly number[],
    stillMembersBeforeDissolve: readonly number[],
    tick: number,
    byId: Map<number, CommunityEntity>,
  ): void {
    const removed = this.registry.dissolve(communityId);
    if (!removed) return;
    // Only members STILL in the community at the moment of dissolution get
    // a stockpile share — anyone who defected (LEAVE) earlier in this same
    // pass forfeited their claim by leaving; the DISSOLVED event's
    // `memberIds`, however, reports the FULL former roster (including this
    // pass's departures) since that's the complete community that just
    // ended, for any downstream consumer (hollow-07's eventual export).
    const remaining = [...stillMembersBeforeDissolve].sort((a, b) => a - b);
    for (const memberId of remaining) {
      const entity = byId.get(memberId);
      if (entity) entity.communityId = null;
    }
    // Stockpile reverts to the remaining members, split as evenly as
    // possible (see distributeEvenly), remainder to the lowest ids. If no
    // members remain, the stockpile has nowhere to go — discarded (a
    // deliberate simplification; see the hollow-04 handoff notes — there is
    // no "commons" holding structure in this chunk).
    if (remaining.length > 0) {
      for (const kind of Object.keys(removed.stockpile)) {
        const total = removed.stockpile[kind] ?? 0;
        const shares = distributeEvenly(total, remaining.length);
        remaining.forEach((memberId, i) => {
          const entity = byId.get(memberId);
          if (entity) addGoods(entity.inventory, kind, shares[i]!);
        });
      }
    }
    this.emit(
      ONT_COMMUNITY.DISSOLVED,
      { communityId, memberIds: [...formerMembers].sort((a, b) => a - b), tick },
      tick,
    );
  }

  // ---- 2. SPLIT ---------------------------------------------------------

  private runSplit(tick: number, byId: Map<number, CommunityEntity>): void {
    const hasEdge = this.mutualEdge(byId);
    for (const community of this.registry.all()) {
      if (community.members.length < this.minSize * 2) continue;
      const wholeDensity = density(community.members, hasEdge);
      if (wholeDensity >= this.minDensity) continue; // still cohesive — no split

      const components = connectedComponents(community.members, hasEdge);
      const qualifying = components
        .filter((c) => c.length >= this.minSize)
        .sort((a, b) => b.length - a.length || a[0]! - b[0]!);
      if (qualifying.length < 2) continue; // can't form 2 viable halves this pass

      const halfA = qualifying[0]!;
      const halfB = qualifying[1]!;
      const keeperIsA = halfA[0]! < halfB[0]!;
      const keeper = [...(keeperIsA ? halfA : halfB)].sort((a, b) => a - b);
      const mover = [...(keeperIsA ? halfB : halfA)].sort((a, b) => a - b);
      const placed = new Set([...keeper, ...mover]);
      const stragglers = community.members.filter((m) => !placed.has(m));

      this.registry.setMembers(community.id, keeper);
      const newCommunity = this.registry.form(mover, this.territoryOf(mover, byId), tick, {
        ...community.norms,
      });

      for (const kind of Object.keys(community.stockpile)) {
        const total = community.stockpile[kind] ?? 0;
        const moverShare = Math.floor((total * mover.length) / (keeper.length + mover.length));
        community.stockpile[kind] = total - moverShare;
        newCommunity.stockpile[kind] = moverShare;
      }

      for (const id of mover) {
        const e = byId.get(id);
        if (e) e.communityId = newCommunity.id;
      }
      for (const id of stragglers) {
        const e = byId.get(id);
        if (e) e.communityId = null;
      }

      this.emit(
        ONT_COMMUNITY.SPLIT,
        {
          originalId: community.id,
          newId: newCommunity.id,
          keptMemberIds: keeper,
          newMemberIds: mover,
          strandedAgentIds: stragglers,
          tick,
        },
        tick,
      );
    }
  }

  // ---- 3. MERGE -----------------------------------------------------------

  private runMerge(tick: number, byId: Map<number, CommunityEntity>): void {
    const ids = this.registry.all().map((c) => c.id);
    for (let i = 0; i < ids.length; i++) {
      const a = this.registry.get(ids[i]!);
      if (!a) continue;
      for (let j = i + 1; j < ids.length; j++) {
        const b = this.registry.get(ids[j]!);
        if (!b) continue;
        if (!this.territoriesNear(a.territory, b.territory)) continue;
        const cross = this.crossTrust(a, b, byId);
        if (cross < this.mergeCrossTrustThreshold) continue;

        const keepId = Math.min(a.id, b.id);
        const otherId = Math.max(a.id, b.id);
        const keeper = keepId === a.id ? a : b;
        const other = otherId === a.id ? a : b;
        const merged = [...new Set([...keeper.members, ...other.members])].sort((x, y) => x - y);

        this.registry.setMembers(keepId, merged);
        for (const kind of Object.keys(other.stockpile)) {
          this.registry.contribute(keepId, kind, other.stockpile[kind] ?? 0);
        }
        this.registry.dissolve(otherId);

        for (const id of other.members) {
          const e = byId.get(id);
          if (e) e.communityId = keepId;
        }

        this.emit(
          ONT_COMMUNITY.MERGED,
          { keptId: keepId, absorbedId: otherId, memberIds: merged, tick },
          tick,
        );
        break; // `a`'s participation in a merge this pass ends here — at
        // most one merge per community per check interval (see class doc).
      }
    }
  }

  // ---- 4. GROW ------------------------------------------------------------

  private runGrow(tick: number, byId: Map<number, CommunityEntity>): void {
    const joinedThisPass = new Set<number>();
    for (const community of this.registry.all()) {
      if (community.members.length === 0) continue;
      const unaffiliated = [...byId.values()]
        .filter((e) => e.communityId === null && !joinedThisPass.has(e.id))
        .map((e) => e.id)
        .sort((a, b) => a - b);

      for (const candidateId of unaffiliated) {
        const candidate = byId.get(candidateId)!;
        let toSum = 0;
        let fromSum = 0;
        let n = 0;
        for (const memberId of community.members) {
          const member = byId.get(memberId);
          if (!member) continue;
          toSum += relationshipScore(candidate.relationships, memberId);
          fromSum += relationshipScore(member.relationships, candidateId);
          n++;
        }
        if (n === 0) continue;
        const combined = (toSum / n + fromSum / n) / 2;
        if (combined >= this.joinTrustThreshold) {
          this.registry.addMember(community.id, candidateId);
          candidate.communityId = community.id;
          joinedThisPass.add(candidateId);
          this.emit(ONT_COMMUNITY.JOINED, { communityId: community.id, agentId: candidateId, tick }, tick);
        }
      }
    }
  }

  // ---- 5. FORM (crystallization proper) ------------------------------------

  private runForm(tick: number, byId: Map<number, CommunityEntity>): void {
    const unaffiliated = [...byId.values()]
      .filter((e) => e.communityId === null)
      .map((e) => e.id)
      .sort((a, b) => a - b);
    if (unaffiliated.length < this.minSize) return;

    const hasEdge = this.mutualEdge(byId);
    const components = connectedComponents(unaffiliated, hasEdge);
    for (const comp of components) {
      if (comp.length < this.minSize) continue;
      if (density(comp, hasEdge) < this.minDensity) continue;
      const community = this.registry.form(comp, this.territoryOf(comp, byId), tick);
      for (const id of comp) {
        const e = byId.get(id);
        if (e) e.communityId = community.id;
      }
      this.emit(ONT_COMMUNITY.FORMED, { communityId: community.id, memberIds: comp, tick }, tick);
    }
  }

  // ---- shared helpers -----------------------------------------------------

  private mutualEdge(byId: Map<number, CommunityEntity>): (a: number, b: number) => boolean {
    return (a, b) => {
      const ea = byId.get(a);
      const eb = byId.get(b);
      if (!ea || !eb) return false;
      return mutualTrust(ea, eb) >= this.trustThreshold;
    };
  }

  private crossTrust(a: Community, b: Community, byId: Map<number, CommunityEntity>): number {
    let sum = 0;
    let count = 0;
    for (const m of a.members) {
      const em = byId.get(m);
      if (!em) continue;
      for (const n of b.members) {
        const en = byId.get(n);
        if (!en) continue;
        sum += mutualTrust(em, en);
        count++;
      }
    }
    return count === 0 ? 0 : sum / count;
  }

  private territoriesNear(a: readonly CommunityTile[], b: readonly CommunityTile[]): boolean {
    for (const ta of a) {
      for (const tb of b) {
        if (Math.max(Math.abs(ta.gx - tb.gx), Math.abs(ta.gy - tb.gy)) <= this.mergeTerritoryRadius) {
          return true;
        }
      }
    }
    return false;
  }

  private territoryOf(ids: readonly number[], byId: Map<number, CommunityEntity>): CommunityTile[] {
    const byKey = new Map<string, CommunityTile>();
    for (const id of ids) {
      const e = byId.get(id);
      if (!e) continue;
      const key = `${e.agent.gx},${e.agent.gy}`;
      if (!byKey.has(key)) byKey.set(key, { gx: e.agent.gx, gy: e.agent.gy });
    }
    return [...byKey.values()].sort((a, b) => a.gx - b.gx || a.gy - b.gy);
  }

  private recomputeTerritories(byId: Map<number, CommunityEntity>): void {
    for (const community of this.registry.all()) {
      this.registry.setTerritory(community.id, this.territoryOf(community.members, byId));
    }
  }

  private emit(ontology: string, body: Record<string, unknown>, tick: number): void {
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology,
        sender: "world",
        recipient: "broadcast",
        body,
      },
      tick,
    );
  }
}
