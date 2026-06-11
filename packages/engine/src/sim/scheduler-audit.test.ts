/**
 * scheduler-audit.test.ts
 *
 * AUDIT POSITIVE — a tiny synthetic scheduler where system A sends ontology
 * "test-onto" and system B calls bus.markRead("test-onto"), both in the SAME
 * stage. The audit must THROW naming the stage and ontology.
 */

import { describe, it, expect } from "vitest";
import { Scheduler } from "./scheduler";
import { MessageBus } from "./message-bus";

describe("stage audit throws on same-stage write + read", () => {
  it("throws when an ontology is written and read in the same stage", () => {
    const bus = new MessageBus();
    const scheduler = new Scheduler();

    // Both systems share the same stage "TEST-STAGE".
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
