/**
 * `InspectDetail` — the plain-data shape a click-to-inspect request resolves
 * to (chunk hollow-09c). Crosses the Worker `postMessage` boundary (see
 * `worker/sim-worker.ts`'s `WorkerOutbound |= {type:"inspectResult"}`), so
 * every field here MUST be structured-clone-safe: numbers/strings/booleans/
 * plain objects/arrays only — no functions, class instances, Maps, or Sets.
 * Both the worker (`worker/inspect.ts`, which assembles it by READING live
 * `BootedHollowSim` state) and the main-thread panel (`inspect-panel.ts`)
 * import this module, so it lives at the client's top level rather than
 * under `render3d/` or `worker/`.
 */

export interface InspectAppearance {
  readonly height: number;
  readonly build: number;
  readonly skinTone: string;
  readonly hairTone: string;
}

/** Heritable traits (see `@hollow/sim-core/components`'s `Genome`) — always
 *  available, alive or dead (the permanent `LineageRegistry` entry keeps a
 *  copy for a dead agent). */
export interface InspectGenome {
  readonly behavior: Readonly<Record<string, number>>;
  readonly aptitude: Readonly<Record<string, number>>;
  readonly appearance: InspectAppearance;
}

/** A compact, serializable BDI summary — current action/intention plus the
 *  handful of belief FLAGS the sim actually writes (see
 *  `sim-core/systems/perceive.ts`, `sim-core/social/act-system.ts`); never
 *  the raw `beliefs.data`/`intentions.queue` objects (those are internal
 *  sim shapes, not a stable cross-boundary contract). `null` for a dead
 *  agent — its live BDI components are gone once the world despawns it. */
export interface InspectBdi {
  readonly action: string;
  readonly intentionKind: string | null;
  readonly starving: boolean;
  readonly foodDepletedTicks: number;
  readonly violentDeath: boolean;
}

export interface InspectRelationship {
  readonly peerId: number;
  readonly peerName: string;
  readonly score: number;
}

export interface InspectKinRef {
  readonly id: number;
  readonly name: string;
}

export interface InspectKin {
  readonly parents: readonly InspectKinRef[];
  readonly children: readonly InspectKinRef[];
  readonly partner: InspectKinRef | null;
}

export interface InspectCommunity {
  readonly id: number;
  readonly memberCount: number;
  readonly shareRate: number;
  readonly cooperationExpectation: number;
}

/** A dead agent's ever-recorded cause (see `@hollow/sim-core/lineage`'s
 *  `DeathCause`) — duplicated here (a string literal union, not an import)
 *  since this module must stay import-free of sim-core's internal types to
 *  guarantee postMessage-safety; kept in lockstep by convention. */
export type InspectDeathCause = "oldAge" | "starvation" | "violence";

export interface InspectDetail {
  readonly id: number;
  /** Stable deterministic display name — see `agent-name.ts`'s `agentName`. */
  readonly name: string;
  readonly alive: boolean;
  /** "child" | "adult" | "elder" while alive; `"deceased"` once dead (the
   *  live `Lifecycle` component is gone after despawn — see
   *  `worker/inspect.ts`'s header). */
  readonly stage: string;
  readonly ageTicks: number;
  readonly communityId: number | null;
  readonly householdId: number | null;
  readonly genome: InspectGenome;
  /** Raw need values (not fractions), keyed by need kind — `null` once dead. */
  readonly needs: Readonly<Record<string, number>> | null;
  readonly starving: boolean;
  readonly bdi: InspectBdi | null;
  /** Top trust ties by score, descending — empty once dead (the ledger is
   *  gone) or for a live agent with no recorded peers yet. */
  readonly relationships: readonly InspectRelationship[];
  readonly kin: InspectKin;
  /** `null` if unaffiliated (or once dead — membership is cleared at death). */
  readonly community: InspectCommunity | null;
  readonly deathCause: InspectDeathCause | null;
  readonly deathTick: number | null;
}
