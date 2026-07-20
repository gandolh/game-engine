/**
 * Chronicle — Hollow's structured event capture (promoted to
 * `@hollow/sim-core/observe` by chunk hollow-10a from the research CLI's
 * original `tools/hollow-sim/src/chronicle.ts`, chunk hollow-07).
 * Subscribes to `sim.bus` for every ontology the brief calls out
 * (ONT_FAMILY.*, ONT_COMMUNITY.*, ONT_SOCIAL.*, ONT_STARVATION.ONSET,
 * ONT_GOVERNANCE.* — chunk hollow-12a's leader-changed/norm-changed/
 * sanctioned events) and buffers each as a flat, stably-keyed
 * `ChronicleEvent` in dispatch order — the input to `events.jsonl` and to
 * the browser client's chronicle feed (which falls back to a generic
 * ontology/body rendering for anything it has no dedicated formatter for
 * yet — see hollow-12a's brief for why a nicer governance-specific line is
 * a later chunk's job, not this one's).
 *
 * Read-only / off-sim-path: `bus.subscribeOntology` only registers a
 * listener the sim already calls from its own `notifySubscribers()` (see
 * `sim-bootstrap.ts`'s `tick()`) — nothing here perturbs the deterministic
 * tick path, mirrors how `sim-bootstrap.ts` itself subscribes to
 * ONT_FAMILY.BIRTH/DEATH to maintain `bornCount`/`diedCount`.
 *
 * Also tracks a small cumulative "deaths by cause" counter alongside the
 * raw event buffer, purely as a convenience so a per-year metrics sampler
 * (see `sampler.ts`) can diff two cumulative reads into a per-sample WINDOW
 * count (mirrors how `HollowSnapshot.bornCount`/`diedCount` are themselves
 * cumulative totals meant to be diffed between samples) without rescanning
 * the whole event buffer every sample.
 */
import type { MessageBus } from "@engine/core";
import { ONT_FAMILY, ONT_COMMUNITY, ONT_SOCIAL, ONT_STARVATION, ONT_GOVERNANCE } from "../protocols";

/** One flattened chronicle line: `{ tick, ontology, ...body }` — `tick` is
 *  read from the body (every Hollow event body carries its own `tick`
 *  field), so the spread below never overwrites it with a different value. */
export interface ChronicleEvent {
  readonly tick: number;
  readonly ontology: string;
  readonly [key: string]: unknown;
}

export interface DeathsByCause {
  oldAge: number;
  starvation: number;
  violence: number;
}

export interface Chronicle {
  /** All captured events so far, in dispatch order (tick order, and within
   *  a tick, subscriber-notify order). */
  events(): readonly ChronicleEvent[];
  /** Cumulative deaths by cause since sim start (diff two reads for a
   *  per-window count — see `sampler.ts`). */
  deathsByCause(): Readonly<DeathsByCause>;
}

const ALL_SOCIAL_ONTOLOGIES: readonly string[] = Object.values(ONT_SOCIAL);
const ALL_FAMILY_ONTOLOGIES: readonly string[] = Object.values(ONT_FAMILY);
const ALL_COMMUNITY_ONTOLOGIES: readonly string[] = Object.values(ONT_COMMUNITY);
const ALL_GOVERNANCE_ONTOLOGIES: readonly string[] = Object.values(ONT_GOVERNANCE);

function bodyTick(body: Record<string, unknown>): number {
  const t = body["tick"];
  return typeof t === "number" ? t : 0;
}

/** Wires up every chronicle subscription on `bus` and returns a handle to
 *  read what's been captured so far. Call once, right after
 *  `bootstrapHollowSim`, before the first `tick()`. */
export function createChronicle(bus: MessageBus): Chronicle {
  const buffer: ChronicleEvent[] = [];
  const deaths: DeathsByCause = { oldAge: 0, starvation: 0, violence: 0 };

  const capture = (ontology: string) => (msg: { body: Record<string, unknown> }): void => {
    buffer.push({ tick: bodyTick(msg.body), ontology, ...msg.body });
  };

  for (const ontology of ALL_FAMILY_ONTOLOGIES) {
    bus.subscribeOntology(ontology, capture(ontology));
  }
  for (const ontology of ALL_COMMUNITY_ONTOLOGIES) {
    bus.subscribeOntology(ontology, capture(ontology));
  }
  for (const ontology of ALL_SOCIAL_ONTOLOGIES) {
    bus.subscribeOntology(ontology, capture(ontology));
  }
  for (const ontology of ALL_GOVERNANCE_ONTOLOGIES) {
    bus.subscribeOntology(ontology, capture(ontology));
  }
  bus.subscribeOntology(ONT_STARVATION.ONSET, capture(ONT_STARVATION.ONSET));

  // Cause-specific death tally — ONT_FAMILY.DEATH's body carries `cause`
  // ("oldAge" | "starvation" | "violence"); every death is one of the three,
  // so no "unknown cause" bucket is needed.
  bus.subscribeOntology(ONT_FAMILY.DEATH, (msg) => {
    const cause = (msg.body as Record<string, unknown>)["cause"];
    if (cause === "oldAge") deaths.oldAge++;
    else if (cause === "starvation") deaths.starvation++;
    else if (cause === "violence") deaths.violence++;
  });

  return {
    events: () => buffer,
    deathsByCause: () => deaths,
  };
}

/** Count of events matching a given ontology — used for the end-of-run
 *  summary (e.g. "community formed/dissolved counts"). Pure over the
 *  already-captured buffer. */
export function countByOntology(events: readonly ChronicleEvent[], ontology: string): number {
  let n = 0;
  for (const e of events) if (e.ontology === ontology) n++;
  return n;
}
