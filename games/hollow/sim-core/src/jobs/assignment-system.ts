/**
 * HollowJobAssignmentSystem — chunk hollow-14b's PERIODIC (mirrors the
 * governance pass's own cadence — see `JOBS_ASSIGN_INTERVAL_TICKS`'s doc)
 * job-assignment pass. Runs in its own "JOBS" stage, placed immediately
 * after GOVERNANCE (sim-bootstrap.ts) so this pass always reads a
 * just-computed, up-to-date `community.leaderId` for the SAME tick.
 *
 * Per agent, ascending id (determinism, CLAUDE.md):
 *   - unaffiliated (`communityId == null`) → self-assign by PURE aptitude
 *     fit, no demand term (the brief's "loners self-assign" rule).
 *   - affiliated but the community has NO leader yet (`leaderId == null`,
 *     the pre-governance bootstrap window) → same pure-aptitude
 *     self-assignment as a loner (the brief's "before any leader exists,
 *     everyone self-assigns" bootstrap rule).
 *   - affiliated with a LED community → the leader's assignment: aptitude
 *     fit, NUDGED by that community's own per-capita stockpile shortage
 *     (short on food → biases toward food-gatherer; short on materials →
 *     biases toward material-gatherer). Nothing here actually reads WHO the
 *     leader is or its own genome — "the leader assigns" is a narrative
 *     frame for a deterministic community-level policy, not a per-leader
 *     personality effect (there is no leader-specific dial to speak of yet;
 *     a documented seam for a later brief).
 *
 * `ONT_JOBS.ROLE_CHANGED` fires only when an agent's role actually changes
 * (never on a no-op re-pick of the same role) — see protocols/jobs.ts.
 *
 * ── determinism ───────────────────────────────────────────────────────────
 * No `Rng` anywhere in this system — every decision is arithmetic over
 * already-deterministic inputs (genome floats, community stockpile/member
 * counts). Agents are processed in a freshly-sorted-by-id list (never
 * `World.query`'s incidental iteration order — same discipline as
 * `HollowGovernanceSystem`); the only genuine tie is role vs. role at
 * EXACTLY equal fit, broken by `ASSIGNABLE_JOB_ROLES`'s fixed iteration
 * order (first-listed role wins a strict tie), mirroring every other
 * Hollow system's "fixed order + strict `>`" tie-break convention.
 */
import type { SimContext, System, World, MessageBus } from "@engine/core";
import { PERFORMATIVE } from "@engine/core/agent";
import type { HollowEntity, Genome, JobRole } from "../components";
import { GOOD_FOOD, GOOD_MATERIALS } from "../economy";
import type { CommunityRegistry, Community } from "../community";
import { ONT_JOBS } from "../protocols";
import {
  JOBS_ASSIGN_INTERVAL_TICKS,
  ASSIGNABLE_JOB_ROLES,
  ROLE_CRAFTER_MATERIAL_WEIGHT,
  ROLE_CRAFTER_CURIOSITY_WEIGHT,
  ROLE_TEACHER_CURIOSITY_WEIGHT,
  ROLE_TEACHER_SOCIABILITY_WEIGHT,
  ROLE_CARETAKER_LOYALTY_WEIGHT,
  ROLE_CARETAKER_SOCIABILITY_WEIGHT,
  ROLE_GRAVEDIGGER_INDUSTRIOUSNESS_WEIGHT,
  ROLE_GRAVEDIGGER_LOYALTY_WEIGHT,
  ROLE_MEDIC_CURIOSITY_WEIGHT,
  ROLE_MEDIC_LOYALTY_WEIGHT,
  ROLE_CARE_FIT_SCALE,
  JOBS_DEMAND_PERCAPITA_TARGET,
  JOBS_DEMAND_BIAS_WEIGHT,
  JOBS_CORPSE_DEMAND_TARGET,
  JOBS_SICK_DEMAND_TARGET,
  JOBS_GRAVEDIGGER_DEMAND_BIAS_WEIGHT,
  JOBS_MEDIC_DEMAND_BIAS_WEIGHT,
} from "./constants";

export interface JobAssignmentSystemOptions {
  intervalTicks?: number;
}

type JobsEntity = HollowEntity & {
  id: number;
  genome: NonNullable<HollowEntity["genome"]>;
  occupation: NonNullable<HollowEntity["occupation"]>;
  communityId: number | null;
};

interface Demand {
  readonly food: number;
  readonly material: number;
}

/** The town-wide care backlog (chunk hollow-15), computed once per pass and
 *  applied to EVERY agent (not gated on community membership — see `run`). */
interface CareDemand {
  readonly gravedigger: number;
  readonly medic: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class HollowJobAssignmentSystem implements System {
  readonly name = "HollowJobAssignmentSystem";

  private readonly intervalTicks: number;

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly communities: CommunityRegistry,
    private readonly bus: MessageBus,
    opts: JobAssignmentSystemOptions = {},
  ) {
    this.intervalTicks = opts.intervalTicks ?? JOBS_ASSIGN_INTERVAL_TICKS;
  }

  run(ctx: SimContext): void {
    if (ctx.tick % this.intervalTicks !== 0) return;

    const byId = new Map<number, JobsEntity>();
    for (const e of this.world.query("genome", "occupation", "communityId")) {
      byId.set((e as JobsEntity).id, e as JobsEntity);
    }

    // Per-community demand, computed ONCE up front for every LED community
    // (a community with no leader yet never applies a demand term — see
    // this file's header). Communities iterated ascending id, though the
    // demand computation itself doesn't depend on that order (no shared
    // mutable state across communities).
    // Town-wide care backlog (chunk hollow-15) — one count of unburied corpses
    // (every live corpse entity is unburied; burial despawns it) and sick
    // agents, shared across every LED community.
    const careDemand = this.computeCareDemand();

    const demandByCommunity = new Map<number, Demand>();
    for (const community of this.communities.all()) {
      if (community.leaderId == null) continue;
      demandByCommunity.set(community.id, this.computeDemand(community));
    }

    const ids = [...byId.keys()].sort((a, b) => a - b);
    for (const id of ids) {
      const member = byId.get(id);
      if (!member) continue;
      const communityId = member.communityId;
      const demand = communityId != null ? demandByCommunity.get(communityId) : undefined;
      // Care demand (chunk hollow-15) applies to EVERYONE — including loners
      // and members of a not-yet-led community — not just led-community
      // members like the food/material stockpile demand. Burial is a survival
      // reflex, not a political luxury: an epidemic that kills a community's
      // leader must not also switch off the town's ability to staff a
      // grave-digger (the exact runaway-collapse failure mode observed when
      // care demand was leader-gated).
      const newRole = this.pickRole(member.genome, demand, careDemand);
      const oldRole = member.occupation.role;
      if (newRole === oldRole) continue;
      member.occupation.role = newRole;
      this.emit(ONT_JOBS.ROLE_CHANGED, { agentId: id, communityId, oldRole, newRole, tick: ctx.tick }, ctx.tick);
    }
  }

  // ---- demand -------------------------------------------------------------

  private computeDemand(community: Community): Demand {
    const memberCount = Math.max(community.members.length, 1);
    const foodPerCapita = (community.stockpile[GOOD_FOOD] ?? 0) / memberCount;
    const materialPerCapita = (community.stockpile[GOOD_MATERIALS] ?? 0) / memberCount;
    return {
      food: clamp(1 - foodPerCapita / JOBS_DEMAND_PERCAPITA_TARGET, 0, 1),
      material: clamp(1 - materialPerCapita / JOBS_DEMAND_PERCAPITA_TARGET, 0, 1),
    };
  }

  /** Town-wide care backlog (chunk hollow-15): unburied-corpse count → grave-
   *  digger demand, sick-agent count → medic demand, each clamped to [0,1]
   *  against its target. Rng-free (plain counts over `world.query`). */
  private computeCareDemand(): CareDemand {
    let corpseCount = 0;
    for (const _e of this.world.query("corpse")) corpseCount++;
    let sickCount = 0;
    for (const _e of this.world.query("disease")) sickCount++;
    return {
      gravedigger: clamp(corpseCount / JOBS_CORPSE_DEMAND_TARGET, 0, 1),
      medic: clamp(sickCount / JOBS_SICK_DEMAND_TARGET, 0, 1),
    };
  }

  // ---- role fit -------------------------------------------------------------

  private roleFit(genome: Genome, role: JobRole): number {
    const foodApt = genome.aptitude["food"] ?? 0.5;
    const materialApt = genome.aptitude["material"] ?? 0.5;
    const loyalty = genome.behavior["loyalty"] ?? 0.5;
    const sociability = genome.behavior["sociability"] ?? 0.5;
    const curiosity = genome.behavior["curiosity"] ?? 0.5;
    const industriousness = genome.behavior["industriousness"] ?? 0.5;
    switch (role) {
      case "food-gatherer":
        return foodApt;
      case "material-gatherer":
        return materialApt;
      case "crafter":
        return ROLE_CRAFTER_MATERIAL_WEIGHT * materialApt + ROLE_CRAFTER_CURIOSITY_WEIGHT * curiosity;
      case "teacher":
        return ROLE_TEACHER_CURIOSITY_WEIGHT * curiosity + ROLE_TEACHER_SOCIABILITY_WEIGHT * sociability;
      case "caretaker":
        return ROLE_CARETAKER_LOYALTY_WEIGHT * loyalty + ROLE_CARETAKER_SOCIABILITY_WEIGHT * sociability;
      case "grave-digger":
        return ROLE_CARE_FIT_SCALE * (ROLE_GRAVEDIGGER_INDUSTRIOUSNESS_WEIGHT * industriousness + ROLE_GRAVEDIGGER_LOYALTY_WEIGHT * loyalty);
      case "medic":
        return ROLE_CARE_FIT_SCALE * (ROLE_MEDIC_CURIOSITY_WEIGHT * curiosity + ROLE_MEDIC_LOYALTY_WEIGHT * loyalty);
      case "unassigned":
        return -Infinity; // never the argmax outcome — not in ASSIGNABLE_JOB_ROLES anyway
    }
  }

  private pickRole(genome: Genome, demand: Demand | undefined, care: CareDemand): JobRole {
    let best: JobRole = ASSIGNABLE_JOB_ROLES[0]!;
    let bestScore = -Infinity;
    for (const role of ASSIGNABLE_JOB_ROLES) {
      let score = this.roleFit(genome, role);
      // Food/material demand is per-LED-community (undefined for loners /
      // leaderless); care demand is town-wide and applies to everyone.
      if (demand) {
        if (role === "food-gatherer") score += JOBS_DEMAND_BIAS_WEIGHT * demand.food;
        else if (role === "material-gatherer") score += JOBS_DEMAND_BIAS_WEIGHT * demand.material;
      }
      if (role === "grave-digger") score += JOBS_GRAVEDIGGER_DEMAND_BIAS_WEIGHT * care.gravedigger;
      else if (role === "medic") score += JOBS_MEDIC_DEMAND_BIAS_WEIGHT * care.medic;
      // Strict `>` so the FIRST role (ASSIGNABLE_JOB_ROLES's fixed order)
      // to reach a given score keeps it — the deterministic tie-break.
      if (score > bestScore) {
        bestScore = score;
        best = role;
      }
    }
    return best;
  }

  // ---- shared helper --------------------------------------------------------

  private emit(ontology: string, body: Record<string, unknown>, tick: number): void {
    this.bus.send({ performative: PERFORMATIVE.INFORM, ontology, sender: "world", recipient: "broadcast", body }, tick);
  }
}
