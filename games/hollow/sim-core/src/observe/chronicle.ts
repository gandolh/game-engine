/**
 * Chronicle — Hollow's structured event capture (promoted to
 * `@hollow/sim-core/observe` by chunk hollow-10a from the research CLI's
 * original `tools/hollow-sim/src/chronicle.ts`, chunk hollow-07).
 * Subscribes to `sim.bus` for every ontology the brief calls out
 * (ONT_FAMILY.*, ONT_COMMUNITY.*, ONT_SOCIAL.*, ONT_STARVATION.ONSET,
 * ONT_GOVERNANCE.* — chunk hollow-12a's leader-changed/norm-changed/
 * sanctioned events, ONT_FEUD.* — chunk hollow-12b's started/escalated/
 * reconciled grudge-arc events, ONT_JOBS.* — chunk hollow-14b's
 * role-changed events) and buffers each as a flat, stably-keyed
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
import { ONT_FAMILY, ONT_COMMUNITY, ONT_SOCIAL, ONT_STARVATION, ONT_GOVERNANCE, ONT_FEUD, ONT_JOBS, ONT_MORTALITY } from "../protocols";

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
  /** Disease deaths (chunk hollow-15) — a real, firing cause (unlike the
   *  violence seam). */
  disease: number;
}

export interface Chronicle {
  /** The most recent captured events, oldest first, in dispatch order (tick
   *  order, and within a tick, subscriber-notify order) — bounded to at most
   *  `CHRONICLE_CAP` (or the `cap` passed to `createChronicle`) entries. Once
   *  the cap is reached, the OLDEST retained event is evicted for each new
   *  one captured — see `droppedCount()` for how many have been elided. */
  events(): readonly ChronicleEvent[];
  /** Cumulative deaths by cause since sim start (diff two reads for a
   *  per-window count — see `sampler.ts`). Unaffected by the `events()` cap —
   *  these are running counters, not stored events. */
  deathsByCause(): Readonly<DeathsByCause>;
  /** Count of captured events evicted from `events()` because the buffer was
   *  at `cap` when they aged out (oldest-first) — 0 for any run that never
   *  reached the cap. A consumer that needs to know whether its read of
   *  `events()` is the complete history (e.g. an export) must check this
   *  rather than assume completeness. */
  droppedCount(): number;
}

/**
 * Default cap on `Chronicle.events()` (audit-12) — the buffer was
 * previously unbounded, and cooperation events alone fire hundreds per
 * sim-year (see this file's header and `research-store.ts`'s matching
 * client-side cap), so an hour-long research run retained hundreds of
 * thousands of event objects with no eviction.
 *
 * 50,000 is chosen to be generous enough that a normal session never reaches
 * it — at ~500 events/sim-year that's on the order of a hundred sim-years of
 * continuous history (Hollow's own generational timescale), and at the
 * failure scenario's worst-case sustained rate (~3,000 events/wall-clock
 * minute) it's still ~15-17 minutes of uninterrupted capture before the
 * oldest entries start aging out — well past a normal look-in session, and
 * exports past that point honestly report what was dropped (`droppedCount`)
 * rather than silently truncating. 50,000 flat, few-field event objects is a
 * small, bounded footprint (order 10MB), a non-issue next to the unbounded
 * growth this replaces.
 */
export const CHRONICLE_CAP = 50_000;

const ALL_SOCIAL_ONTOLOGIES: readonly string[] = Object.values(ONT_SOCIAL);
const ALL_FAMILY_ONTOLOGIES: readonly string[] = Object.values(ONT_FAMILY);
const ALL_COMMUNITY_ONTOLOGIES: readonly string[] = Object.values(ONT_COMMUNITY);
const ALL_GOVERNANCE_ONTOLOGIES: readonly string[] = Object.values(ONT_GOVERNANCE);
const ALL_FEUD_ONTOLOGIES: readonly string[] = Object.values(ONT_FEUD);
const ALL_JOBS_ONTOLOGIES: readonly string[] = Object.values(ONT_JOBS);
const ALL_MORTALITY_ONTOLOGIES: readonly string[] = Object.values(ONT_MORTALITY);

function bodyTick(body: Record<string, unknown>): number {
  const t = body["tick"];
  return typeof t === "number" ? t : 0;
}

/** Wires up every chronicle subscription on `bus` and returns a handle to
 *  read what's been captured so far. Call once, right after
 *  `bootstrapHollowSim`, before the first `tick()`.
 *
 *  `cap` (default `CHRONICLE_CAP`) bounds how many events `events()` ever
 *  retains at once — implemented as a fixed-capacity ring (`ring`/`head`/
 *  `size` below) rather than an `Array.shift()`-per-eviction, deliberately:
 *  this sim's own tick loop runs on the same thread that captures these
 *  events (see `worker/sim-worker.ts`), so an O(n) `shift()` on every one of
 *  potentially hundreds of thousands of events, once the cap is reached,
 *  would trade unbounded memory for unbounded CPU — a wash, not a fix. The
 *  ring makes eviction O(1); `events()` materializes it into a plain
 *  oldest-first array on read, cached until the next capture invalidates it
 *  (the read is far less frequent than the write, and reads on an unchanged
 *  buffer are common — e.g. two exports back to back). */
export function createChronicle(bus: MessageBus, cap: number = CHRONICLE_CAP): Chronicle {
  const ring: ChronicleEvent[] = new Array(cap);
  let head = 0; // index of the oldest retained event, once `size === cap`
  let size = 0; // number currently retained, 0 <= size <= cap
  let dropped = 0;
  let materialized: readonly ChronicleEvent[] | null = null;
  const deaths: DeathsByCause = { oldAge: 0, starvation: 0, violence: 0, disease: 0 };

  function pushEvent(ev: ChronicleEvent): void {
    if (size < cap) {
      ring[size] = ev;
      size++;
    } else {
      // Full: overwrite the oldest slot and advance `head` past it — the
      // classic ring-buffer eviction, O(1) regardless of `cap`.
      ring[head] = ev;
      head = (head + 1) % cap;
      dropped++;
    }
    materialized = null;
  }

  function materialize(): readonly ChronicleEvent[] {
    if (materialized) return materialized;
    const out: ChronicleEvent[] = new Array(size);
    for (let i = 0; i < size; i++) {
      out[i] = ring[(head + i) % cap] as ChronicleEvent;
    }
    materialized = out;
    return out;
  }

  const capture = (ontology: string) => (msg: { body: Record<string, unknown> }): void => {
    pushEvent({ tick: bodyTick(msg.body), ontology, ...msg.body });
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
  for (const ontology of ALL_FEUD_ONTOLOGIES) {
    bus.subscribeOntology(ontology, capture(ontology));
  }
  for (const ontology of ALL_JOBS_ONTOLOGIES) {
    bus.subscribeOntology(ontology, capture(ontology));
  }
  for (const ontology of ALL_MORTALITY_ONTOLOGIES) {
    bus.subscribeOntology(ontology, capture(ontology));
  }
  bus.subscribeOntology(ONT_STARVATION.ONSET, capture(ONT_STARVATION.ONSET));

  // Cause-specific death tally — ONT_FAMILY.DEATH's body carries `cause`
  // ("oldAge" | "starvation" | "violence" | "disease"); every death is one of
  // the four, so no "unknown cause" bucket is needed.
  bus.subscribeOntology(ONT_FAMILY.DEATH, (msg) => {
    const cause = (msg.body as Record<string, unknown>)["cause"];
    if (cause === "oldAge") deaths.oldAge++;
    else if (cause === "starvation") deaths.starvation++;
    else if (cause === "violence") deaths.violence++;
    else if (cause === "disease") deaths.disease++;
  });

  return {
    events: () => materialize(),
    deathsByCause: () => deaths,
    droppedCount: () => dropped,
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
