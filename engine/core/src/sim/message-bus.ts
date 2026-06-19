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
