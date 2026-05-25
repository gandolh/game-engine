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

export class MessageBus {
  private inflight: QueuedMessage[] = [];
  private deliverable: QueuedMessage[] = [];
  private subscribers = new Map<string, Set<(msg: AgentMessage) => void>>();

  send(message: OutgoingMessage, tickIssued: number): void {
    this.inflight.push({ ...message, tickIssued });
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
