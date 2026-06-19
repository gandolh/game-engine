import type { SimContext, System, MessageBus, World } from "@engine/core";
import type { GameEntity } from "../components";

export class InboxDispatchSystem implements System {
  readonly name = "InboxDispatchSystem";

  constructor(
    private readonly bus: MessageBus,
    private readonly world: World<GameEntity>,
  ) {}

  run(_ctx: SimContext): void {
    this.bus.flush();
    const messages = this.bus.drain();
    if (messages.length === 0) return;
    const inboxes = this.world.query("inbox");
    for (const msg of messages) {
      if (msg.recipient === "broadcast") {
        for (const entity of inboxes) {
          entity.inbox.messages.push({
            performative: msg.performative,
            ontology: msg.ontology,
            sender: msg.sender,
            body: msg.body,
            tickIssued: msg.tickIssued,
          });
        }
      } else {
        for (const entity of inboxes) {
          if (entity.id === msg.recipient) {
            entity.inbox.messages.push({
              performative: msg.performative,
              ontology: msg.ontology,
              sender: msg.sender,
              body: msg.body,
              tickIssued: msg.tickIssued,
            });
            break;
          }
        }
      }
    }
  }
}
