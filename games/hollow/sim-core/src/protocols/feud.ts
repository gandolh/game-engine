/**
 * Feud ontology (chunk hollow-12b) — structured events for the persistent,
 * directed grudge arcs `social/feud-system.ts`'s `HollowFeudSystem` computes:
 * escalation (harm -> grudge up) and reconciliation (decay or a genuine
 * cooperative gesture -> grudge down). Mirrors the ONT_* + typed-body
 * pattern used by every other Hollow protocol (protocols/governance.ts,
 * protocols/social.ts) — a flat body carrying its own `tick` so
 * `observe/chronicle.ts`'s capture (which reads `body.tick`) works
 * unchanged for these three ontologies too.
 *
 * Emitted broadcast (`recipient: "broadcast"`) so the chronicle/metrics/UI
 * can observe them without being subscribed at the exact tick they fire —
 * same rationale as ONT_SOCIAL's and ONT_GOVERNANCE's headers.
 *
 * `holderId` is the agent WHO HOLDS the grudge (the one who was harmed, or
 * whose grudge is now being reconciled); `towardId` is who the grudge is
 * directed AT (the harmer, or the one extending a cooperative gesture) —
 * matches the directed `Feud.byId` ledger shape one-for-one (components/
 * feud.ts): `holderId`'s `feud.byId.get(towardId)`.
 *
 * `STARTED` fires the first time a directed grudge crosses
 * `FEUD_START_THRESHOLD` from below; `ESCALATED` fires on every SUBSEQUENT
 * harm event added to an ALREADY-active feud (still at/above the
 * threshold); `RECONCILED` fires when an active feud's grudge falls back
 * below `FEUD_RECONCILE_THRESHOLD` — a deliberately LOWER threshold than
 * start, a hysteresis band (see social/feud-system.ts's header) so a grudge
 * hovering right at one boundary doesn't flicker STARTED/RECONCILED every
 * tick.
 */
export const ONT_FEUD = {
  STARTED: "feud.started",
  ESCALATED: "feud.escalated",
  RECONCILED: "feud.reconciled",
} as const;

export type FeudOntology = (typeof ONT_FEUD)[keyof typeof ONT_FEUD];

/** A directed grudge just crossed `FEUD_START_THRESHOLD` from below —
 *  `grudge` is the post-update value that triggered it. */
export interface FeudStartedBody {
  holderId: number;
  towardId: number;
  grudge: number;
  tick: number;
}

/** A further harm event landed on an ALREADY-active directed feud. */
export interface FeudEscalatedBody {
  holderId: number;
  towardId: number;
  grudge: number;
  tick: number;
}

/** An active directed feud's grudge fell back below
 *  `FEUD_RECONCILE_THRESHOLD` — via passive decay or a cooperative gesture
 *  from `towardId` (see feud-system.ts for which). */
export interface FeudReconciledBody {
  holderId: number;
  towardId: number;
  grudge: number;
  tick: number;
}
