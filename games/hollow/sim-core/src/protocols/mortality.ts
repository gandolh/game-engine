/**
 * Mortality & Care ontology (chunk hollow-15) — structured events for the
 * corpse / disease / medic pipeline (mortality/corpse-system.ts,
 * mortality/disease-system.ts, mortality/care-act-system.ts). Mirrors the
 * ONT_* + typed-body pattern of every other Hollow protocol (protocols/jobs.ts,
 * protocols/governance.ts): a flat body carrying its own `tick` so
 * `observe/chronicle.ts`'s capture (which reads `body.tick`) works unchanged.
 *
 * All emitted broadcast (`recipient: "broadcast"`) so chronicle/metrics/UI can
 * observe them without being subscribed at the exact firing tick. Note DEATH
 * itself stays on `ONT_FAMILY.DEATH` (protocols/family.ts) — a disease death is
 * just that event with `cause: "disease"`; this protocol covers the corpse +
 * illness events that have no family-ontology home.
 */
export const ONT_MORTALITY = {
  /** A living agent contracted a disease from a rotting corpse. */
  INFECTED: "mortality.infected",
  /** A sick agent recovered (survived to its recovery-day target). */
  RECOVERED: "mortality.recovered",
  /** A medic treated a patient (dropping its recovery target to the medic days). */
  TREATED: "mortality.treated",
  /** A grave-digger buried a corpse at the graveyard. */
  BURIED: "mortality.buried",
} as const;

export type MortalityOntology = (typeof ONT_MORTALITY)[keyof typeof ONT_MORTALITY];

/** An agent was infected by a rotting corpse. */
export interface InfectedBody {
  agentId: number;
  sourceCorpseId: number;
  tick: number;
}

/** A sick agent recovered on its own or after treatment. */
export interface RecoveredBody {
  agentId: number;
  treated: boolean;
  daysSick: number;
  tick: number;
}

/** A medic treated a patient. */
export interface TreatedBody {
  medicId: number;
  patientId: number;
  tick: number;
}

/** A grave-digger buried a corpse. */
export interface BuriedBody {
  corpseId: number;
  deceasedId: number;
  diggerId: number;
  tick: number;
}
