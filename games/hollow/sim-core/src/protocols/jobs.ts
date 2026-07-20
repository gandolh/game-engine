/**
 * Jobs ontology (chunk hollow-14b) — one structured event for the periodic,
 * leader-assigned (or loner-self-assigned) occupation pass
 * `jobs/assignment-system.ts`'s `HollowJobAssignmentSystem` computes. Mirrors
 * the ONT_* + typed-body pattern used by every other Hollow protocol
 * (protocols/governance.ts, protocols/social.ts) — a flat body carrying its
 * own `tick` so `observe/chronicle.ts`'s capture (which reads `body.tick`)
 * works unchanged for this ontology too.
 *
 * Emitted broadcast (`recipient: "broadcast"`) so the chronicle/metrics/UI
 * can observe it without being subscribed at the exact tick it fires — same
 * rationale as ONT_GOVERNANCE's/ONT_SOCIAL's headers. Only fired when a
 * role actually CHANGES (assignment-system.ts's `run()` compares
 * old-vs-new before emitting) — a no-op re-assignment (same role picked
 * again) never floods the chronicle.
 */
import type { JobRole } from "../components";

export const ONT_JOBS = {
  ROLE_CHANGED: "jobs.role-changed",
} as const;

export type JobsOntology = (typeof ONT_JOBS)[keyof typeof ONT_JOBS];

/** An agent's occupation role changed (leader-assigned, or self-assigned if
 *  a loner / a not-yet-led community — see assignment-system.ts). `communityId`
 *  is `null` for a loner, mirroring `HollowEntity.communityId`'s own shape. */
export interface RoleChangedBody {
  agentId: number;
  communityId: number | null;
  oldRole: JobRole;
  newRole: JobRole;
  tick: number;
}
