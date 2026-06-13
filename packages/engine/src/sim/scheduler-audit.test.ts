

import { describe, it, expect } from "vitest";
import { Scheduler } from "./scheduler";
import { MessageBus } from "./message-bus";

describe("stage audit throws on same-stage write + read", () => {
  it("throws when an ontology is written and read in the same stage", () => {
    const bus = new MessageBus();
    const scheduler = new Scheduler();

    scheduler
      .stage("TEST-STAGE")
      .add({
        name: "WriterSystem",
        run(_ctx) {
          bus.send(
            {
              performative: "inform",
              ontology: "test-onto",
              sender: "world",
              recipient: "broadcast",
              body: {},
            },
            _ctx.tick,
          );
        },
      })
      .add({
        name: "ReaderSystem",
        run(_ctx) {
          bus.markRead("test-onto");
        },
      });

    bus.enableAudit();
    scheduler.enableStageAudit(bus);

    expect(() => scheduler.tick({ tick: 0 })).toThrowError(/test-onto/);
    expect(() => scheduler.tick({ tick: 0 })).toThrowError(/"TEST-STAGE"/);
  });

  it("does NOT throw when writer and reader are in different stages", () => {
    const bus = new MessageBus();
    const scheduler = new Scheduler();

    scheduler
      .stage("WRITE-STAGE")
      .add({
        name: "WriterSystem",
        run(_ctx) {
          bus.send(
            {
              performative: "inform",
              ontology: "test-onto",
              sender: "world",
              recipient: "broadcast",
              body: {},
            },
            _ctx.tick,
          );
        },
      })
      .stage("READ-STAGE")
      .add({
        name: "ReaderSystem",
        run(_ctx) {
          bus.markRead("test-onto");
        },
      });

    bus.enableAudit();
    scheduler.enableStageAudit(bus);

    expect(() => scheduler.tick({ tick: 0 })).not.toThrow();
  });
});
