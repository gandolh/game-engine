/**
 * Governance ontology (chunk hollow-12a) — structured events for the
 * emergent, contestable per-community leadership, the votable norm drift,
 * and collective sanctions `governance/governance-system.ts`'s
 * `HollowGovernanceSystem` computes every governance pass. Mirrors the
 * ONT_* + typed-body pattern used by every other Hollow protocol
 * (protocols/community.ts, protocols/social.ts) — a flat body carrying its
 * own `tick` so `observe/chronicle.ts`'s capture (which reads `body.tick`)
 * works unchanged for these three ontologies too.
 *
 * Emitted broadcast (`recipient: "broadcast"`) so the chronicle/metrics/UI
 * can observe them without being subscribed at the exact tick they fire —
 * same rationale as ONT_COMMUNITY's and ONT_SOCIAL's headers. Nothing in
 * this package (yet) consumes its OWN governance events beyond the
 * chronicle capture; the per-agent standing/violation TALLIES that feed the
 * next governance pass are fed by `ONT_SOCIAL.*` subscriptions instead (see
 * governance-system.ts), not by these events.
 */

/** Which norm a `NORM_CHANGED` event describes — the three
 *  `CommunityNorms` fields the vote pass can drift (community/community.ts). */
export type GovernanceNormKind = "shareRate" | "cooperationExpectation" | "admissionPolicy";

/** The two ways a `SANCTIONED` event's collective sanction can resolve —
 *  see governance-system.ts's sanctions sub-pass for the severity/threshold
 *  rule that picks between them. A trust penalty is applied on EVERY
 *  non-excluded sanction (not its own action tag) — `trustPenalty` on the
 *  body reports its magnitude (0 for `excluded`, where no fine/trust-penalty
 *  is layered on top of the removal). */
export type GovernanceSanctionAction = "fined" | "excluded";

export const ONT_GOVERNANCE = {
  LEADER_CHANGED: "governance.leader-changed",
  NORM_CHANGED: "governance.norm-changed",
  SANCTIONED: "governance.sanctioned",
} as const;

export type GovernanceOntology = (typeof ONT_GOVERNANCE)[keyof typeof ONT_GOVERNANCE];

/** A community's highest-standing member changed (leadership is
 *  CONTESTABLE — recomputed every governance pass, not fixed once set).
 *  `previousLeaderId` is `null` only the very first time a community ever
 *  gets a leader (no prior leader existed to change FROM). */
export interface LeaderChangedBody {
  communityId: number;
  previousLeaderId: number | null;
  newLeaderId: number;
  tick: number;
}

/** A community norm drifted past the meaningful-delta gate
 *  (`NORM_CHANGE_EMIT_EPSILON`) this pass, driven by the standing+genome
 *  weighted member vote (see governance-system.ts's vote sub-pass). */
export interface NormChangedBody {
  communityId: number;
  norm: GovernanceNormKind;
  oldValue: number;
  newValue: number;
  tick: number;
}

/** A member was collectively sanctioned for a detected norm violation
 *  (hoarding, or an antisocial act against a fellow member). `severity` is
 *  the accumulated violation score that triggered this sanction (see
 *  governance-system.ts for the per-violation-kind weights). `finedAmount`
 *  (goods transferred to the community stockpile) and `trustPenalty` (the
 *  magnitude EVERY fellow member's trust toward the violator dropped by)
 *  are both 0 for an `excluded` sanction — exclusion is the sanction, not a
 *  fine/trust-penalty layered on top of it. */
export interface SanctionedBody {
  communityId: number;
  agentId: number;
  severity: number;
  action: GovernanceSanctionAction;
  finedAmount: number;
  trustPenalty: number;
  tick: number;
}
