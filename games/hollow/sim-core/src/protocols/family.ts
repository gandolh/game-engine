/**
 * Family ontology — chunk hollow-05's structured events for pairbond/birth/
 * death/stage-change, mirroring protocols/community.ts's ONT_* + body-shape
 * pattern. Emit-only for this chunk (nothing in hollow-05 subscribes to its
 * own events) — a seam for a later brief's UI/metrics/AI consumers, e.g.
 * hollow-07's CLI export or a future obituary/family-tree feed.
 * `sim-bootstrap.ts` DOES subscribe to BIRTH/DEATH itself, but only to
 * maintain the snapshot's running `bornCount`/`diedCount` totals — it never
 * acts on the message content.
 */
export const ONT_FAMILY = {
  BONDED: "family.bonded",
  BIRTH: "family.birth",
  DEATH: "family.death",
  STAGE_CHANGED: "family.stage-changed",
} as const;

export type FamilyOntology = (typeof ONT_FAMILY)[keyof typeof ONT_FAMILY];

/** Two agents formed a new household. */
export interface FamilyBondedBody {
  householdId: number;
  partnerAId: number;
  partnerBId: number;
  tick: number;
}

/** A household's pregnancy came to term and a child was spawned. */
export interface FamilyBirthBody {
  householdId: number;
  childId: number;
  parentAId: number;
  parentBId: number;
  tick: number;
}

/** An agent died. `cause` mirrors `lineage.LineageEntry.deathCause` —
 *  "violence" is a SEAM ONLY (no combat system exists yet; see
 *  family/lifecycle-system.ts's class doc); "disease" was added by chunk
 *  hollow-15 (a real, firing cause). */
export interface FamilyDeathBody {
  agentId: number;
  cause: "oldAge" | "starvation" | "violence" | "disease";
  tick: number;
}

/** An agent's life stage changed (child -> adult -> elder). */
export interface FamilyStageChangedBody {
  agentId: number;
  stage: "child" | "adult" | "elder";
  tick: number;
}
