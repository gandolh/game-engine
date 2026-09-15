import type { AgentMessage } from "../ecs/components";

export type Recipient = number | "broadcast";

/**
 * Ontology -> body-shape registry. The engine ships this EMPTY and
 * game-agnostic; each game binds its own ontologies onto it via declaration
 * merging, e.g.:
 *
 *   declare module "@engine/core/sim" {
 *     interface OntologyBodies {
 *       "day-start": DayStartBody;
 *     }
 *   }
 *
 * `send()` below is generic over this map: a registered ontology string
 * forces its body to the matching `*Body` interface (so a typo'd ontology,
 * or a body shape that drifts from the registered interface, is a compile
 * error); an ontology string not present in the map falls back to the
 * historical `Record<string, unknown>` body, so unconverted call sites keep
 * compiling unchanged.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface -- open for declaration merging by games
export interface OntologyBodies {}

/** Ontology strings that have a registered body shape. */
export type Ontology = keyof OntologyBodies & string;

/** The body shape for ontology `K`, or the untyped fallback if `K` isn't registered. */
export type BodyFor<K extends string> = K extends Ontology ? OntologyBodies[K] : Record<string, unknown>;

export interface OutgoingMessage<K extends string = string> {
  performative: string;
  ontology: K;
  sender: number | "world";
  recipient: Recipient;
  body: BodyFor<K>;
}

interface QueuedMessage extends OutgoingMessage {
  tickIssued: number;
}

interface StageAuditState {
  stage: string;
  written: Set<string>;
  read: Set<string>;
}

export class MessageBus {
  private inflight: QueuedMessage[] = [];
  private deliverable: QueuedMessage[] = [];
  private subscribers = new Map<string, Set<(msg: AgentMessage) => void>>();

  private auditEnabled = false;
  private auditCurrent: StageAuditState | null = null;

  send<K extends string>(message: OutgoingMessage<K>, tickIssued: number): void {
    // QueuedMessage stores bodies as the untyped fallback shape (heterogeneous
    // ontologies share one queue); BodyFor<K> is always structurally assignable
    // to it, so this cast just erases the per-call literal type, it asserts
    // nothing unsound.
    this.inflight.push({ ...message, tickIssued } as QueuedMessage);
    if (this.auditEnabled && this.auditCurrent !== null) {
      this.auditCurrent.written.add(message.ontology);
    }
  }

  flush(): void {
    const tmp = this.deliverable;
    this.deliverable = this.inflight;
    this.inflight = tmp;
    this.inflight.length = 0;
  }

  drain(): readonly QueuedMessage[] {
    return this.deliverable;
  }

  markRead(ontology: string): void {
    if (this.auditEnabled && this.auditCurrent !== null) {
      this.auditCurrent.read.add(ontology);
    }
  }

  setStage(stage: string): void {
    if (!this.auditEnabled) return;
    if (this.auditCurrent !== null && this.auditCurrent.stage !== stage) {
      this.finalizeStageAudit(this.auditCurrent);
      this.auditCurrent = { stage, written: new Set(), read: new Set() };
    } else if (this.auditCurrent === null) {
      this.auditCurrent = { stage, written: new Set(), read: new Set() };
    }

  }

  endTickAudit(): void {
    if (!this.auditEnabled) return;
    if (this.auditCurrent !== null) {
      this.finalizeStageAudit(this.auditCurrent);
      this.auditCurrent = null;
    }
  }

  enableAudit(): void {
    this.auditEnabled = true;
  }

  private finalizeStageAudit(state: StageAuditState): void {
    const conflicts: string[] = [];
    for (const ontology of state.written) {
      if (state.read.has(ontology)) {
        conflicts.push(ontology);
      }
    }
    if (conflicts.length > 0) {
      throw new Error(
        `stage audit: ontolog${conflicts.length === 1 ? "y" : "ies"} ${conflicts.map((o) => `"${o}"`).join(", ")} written and read within stage "${state.stage}"`,
      );
    }
  }

  subscribeOntology(ontology: string, handler: (msg: AgentMessage) => void): () => void {
    let set = this.subscribers.get(ontology);
    if (!set) {
      set = new Set();
      this.subscribers.set(ontology, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  notifySubscribers(): void {
    for (const msg of this.deliverable) {
      const handlers = this.subscribers.get(msg.ontology);
      if (!handlers || handlers.size === 0) continue;
      const view: AgentMessage = {
        performative: msg.performative,
        ontology: msg.ontology,
        sender: msg.sender,
        body: msg.body,
        tickIssued: msg.tickIssued,
      };
      for (const h of handlers) h(view);
    }
  }
}

/**
 * Narrow a received `AgentMessage` to a registered ontology's body shape.
 * Returns `null` when `msg` isn't that ontology (the discriminant check),
 * so the returned body is `OntologyBodies[K] | null` instead of an unchecked
 * `msg.body as { ... }` cast. Replaces the inline structural casts that
 * used to be duplicated per-reader (see audit-08).
 */
export function bodyOf<K extends Ontology>(msg: AgentMessage, ontology: K): OntologyBodies[K] | null {
  if (msg.ontology !== ontology) return null;
  // Single, centralized cast: `msg.body` is `Record<string, unknown>` on the
  // wire (an inbox holds messages of many ontologies), but the discriminant
  // check above guarantees this particular message was sent through the
  // generic `send<K>()`, which only accepts `OntologyBodies[K]`-shaped bodies
  // for this ontology.
  return msg.body as unknown as OntologyBodies[K];
}
