import type {
  FsmState,
  Beliefs,
  Desires,
  Intentions,
  Personality,
  AgentInbox,
} from "@engine/core";
import type { Needs, RelationshipLedger } from "@engine/core/agent";
import type { HollowAgent } from "./agent";
import type { Inventory } from "./inventory";
import type { Ownership } from "./ownership";
import type { Genome } from "./genome";
import type { Lifecycle } from "./lifecycle";
import type { Skills } from "./skills";
import type { Feud } from "./feud";
import type { Occupation } from "./occupation";

/**
 * Hollow's FSM states for chunk hollow-03. Mirrors Farm's simplest loop
 * (its FSM has many more states for day-phases etc.; Hollow has none of
 * that yet) — an agent is either gathering beliefs/re-deliberating
 * ("PERCEIVE") or carrying out its top intention ("ACT"). See
 * `systems/perceive.ts` and `systems/act.ts` for the transition rules.
 */
export type HollowFsmState = "PERCEIVE" | "ACT";

/**
 * Hollow's entity shape. A fresh interface (not `extends EngineEntity`) so
 * `fsm` can be narrowed to `FsmState<HollowFsmState>` without fighting
 * variance — same pattern as `@farm/sim-core`'s `GameEntity`
 * (components/entity.ts), which does the same for its own FSM union.
 */
export interface HollowEntity {
  id?: number;
  fsm?: FsmState<HollowFsmState>;
  beliefs?: Beliefs;
  desires?: Desires;
  intentions?: Intentions;
  personality?: Personality;
  inbox?: AgentInbox;
  agent?: HollowAgent;
  needs?: Needs;
  inventory?: Inventory;
  ownership?: Ownership;
  /**
   * The engine's generic directed trust ledger (chunk hollow-04) — this
   * agent's "how do I feel about peer X" scores. Populated by
   * `HollowTrustAccrualSystem` from proximity/shared-activity (the BASELINE
   * mechanism this chunk owns); explicit social verbs that also move trust
   * (gift/steal/betray/rumor) are hollow-06's job and will nudge the same
   * ledger via `applyRelationshipDelta`.
   */
  relationships?: RelationshipLedger;
  /**
   * The community (see `community/`) this agent currently belongs to, or
   * `null` if unaffiliated. Nullable (not optional-absent) so systems can
   * clear membership with a plain assignment under `exactOptionalPropertyTypes`
   * — same rationale as `HollowAgent.moveTarget` (components/agent.ts).
   * Every spawned agent gets this initialized to `null` (population.ts), so
   * in practice it is always present once spawned.
   */
  communityId?: number | null;
  /**
   * Heritable traits (chunk hollow-05) — see components/genome.ts. Present
   * on every spawned agent (founders in population.ts, children in
   * family/reproduction-system.ts); optional only because the type is
   * shared with pre-genome hand-built test harnesses (e.g.
   * community/dynamics.test.ts) that construct entities without it.
   */
  genome?: Genome;
  /** Age + life stage (chunk hollow-05) — see components/lifecycle.ts. */
  lifecycle?: Lifecycle;
  /**
   * The household (see `family/`) this agent currently belongs to — either
   * as one of its two partners or as a co-resident child — or `null` if
   * unattached. Nullable (not optional-absent) so systems can clear
   * membership with a plain assignment under `exactOptionalPropertyTypes`
   * — same rationale as `communityId` above. Every spawned agent gets this
   * initialized to `null` (population.ts / family/reproduction-system.ts).
   */
  householdId?: number | null;
  /**
   * Lived skill LEVELS (chunk hollow-06a) — see components/skills.ts for the
   * level-vs-aptitude-cap split. Present on every spawned agent (founders in
   * population.ts, children in family/reproduction-system.ts); optional
   * only because the type is shared with pre-hollow-06a hand-built test
   * harnesses (e.g. community/dynamics.test.ts) that construct entities
   * without it — same rationale as `genome` above.
   */
  skills?: Skills;
  /**
   * Persistent, directed grudge ledger (chunk hollow-12b) — see
   * components/feud.ts for the full rationale (a Hollow-specific
   * antagonism-arc concept, deliberately separate from the generic
   * `relationships` trust ledger above). Present on every spawned agent
   * (founders in population.ts, children in family/reproduction-system.ts);
   * optional only because the type is shared with pre-hollow-12b hand-built
   * test harnesses that construct entities without it — same rationale as
   * `skills`/`genome` above.
   */
  feud?: Feud;
  /**
   * The leader-assigned JOB role (chunk hollow-14b) — see
   * components/occupation.ts. Present on every spawned agent (founders in
   * population.ts, children in family/reproduction-system.ts), starting
   * `"unassigned"` until the periodic JOBS-stage assignment pass sets a real
   * role; optional only because the type is shared with pre-hollow-14b
   * hand-built test harnesses that construct entities without it — same
   * rationale as `skills`/`genome`/`feud` above.
   */
  occupation?: Occupation;
  [key: string]: unknown;
}
