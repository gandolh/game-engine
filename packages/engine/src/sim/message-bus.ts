import type { AgentMessage } from "../ecs/components";

export type Recipient = number | "broadcast";

export interface OutgoingMessage {
  performative: string;
  ontology: string;
  sender: number | "world";
  recipient: Recipient;
  body: Record<string, unknown>;
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

  // Audit state — only allocated when audit is enabled.
  private auditEnabled = false;
  private auditCurrent: StageAuditState | null = null;

  send(message: OutgoingMessage, tickIssued: number): void {
    this.inflight.push({ ...message, tickIssued });
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

  /**
   * Returns the live internal deliverable array for the current tick.
   * WARNING: the returned array is valid only until the next flush(); callers must not retain it across ticks.
   *
   * Note: drain() is a delivery mechanism (InboxDispatchSystem reads it to push to entity inboxes),
   * NOT a consumption read in the audit sense. Direct inbox reads by snoop systems are tracked via
   * markRead() instead. Therefore drain() does NOT record into the audit's read set.
   */
  drain(): readonly QueuedMessage[] {
    return this.deliverable;
  }

  /**
   * Record that the calling system read a message with the given ontology.
   * No-op when audit is disabled — zero overhead in production.
   */
  markRead(ontology: string): void {
    if (this.auditEnabled && this.auditCurrent !== null) {
      this.auditCurrent.read.add(ontology);
    }
  }

  // ---- Audit API (called by Scheduler when enableStageAudit is active) ------

  /**
   * Called by the Scheduler immediately before each system's run().
   * Finalizes the previous stage's audit check when the stage name CHANGES,
   * then starts tracking the new stage. Systems in the same stage share a
   * single accumulated written/read window.
   */
  setStage(stage: string): void {
    if (!this.auditEnabled) return;
    if (this.auditCurrent !== null && this.auditCurrent.stage !== stage) {
      this.finalizeStageAudit(this.auditCurrent);
      this.auditCurrent = { stage, written: new Set(), read: new Set() };
    } else if (this.auditCurrent === null) {
      this.auditCurrent = { stage, written: new Set(), read: new Set() };
    }
    // Same stage: keep accumulating into auditCurrent.
  }

  /** Called by the Scheduler after the last system in a tick to finalize the last stage. */
  endTickAudit(): void {
    if (!this.auditEnabled) return;
    if (this.auditCurrent !== null) {
      this.finalizeStageAudit(this.auditCurrent);
      this.auditCurrent = null;
    }
  }

  /**
   * Enable dev-mode stage audit.
   * When enabled, send() / drain() / markRead() record per-stage ontology access.
   * setStage() / endTickAudit() are called automatically by Scheduler when
   * scheduler.enableStageAudit(bus) is used.
   */
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
