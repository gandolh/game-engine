import { describe, it, expect } from "vitest";
import { CommandQueue } from "./command-queue";
import { CommandSystem } from "./command-system";

describe("CommandQueue", () => {
  it("drains in FIFO order", () => {
    const q = new CommandQueue<{ type: "a" | "b"; payload: number }>();
    q.enqueue({ type: "a", payload: 1 });
    q.enqueue({ type: "b", payload: 2 });
    q.enqueue({ type: "a", payload: 3 });
    const batch = q.drain();
    expect(batch).toEqual([
      { type: "a", payload: 1 },
      { type: "b", payload: 2 },
      { type: "a", payload: 3 },
    ]);
    expect(q.drain()).toEqual([]);
  });

  it("drain clears the queue", () => {
    const q = new CommandQueue<{ type: "x"; payload: string }>();
    q.enqueue({ type: "x", payload: "hello" });
    q.drain();
    expect(q.length).toBe(0);
  });
});

describe("CommandSystem", () => {
  it("dispatches commands to registered handlers in order", () => {
    const q = new CommandQueue<{ type: "inc"; payload: number } | { type: "dec"; payload: number }>();
    const sys = new CommandSystem(q);
    const log: string[] = [];
    sys.register("inc", (cmd) => log.push(`+${cmd.payload}`));
    sys.register("dec", (cmd) => log.push(`-${cmd.payload}`));

    q.enqueue({ type: "inc", payload: 5 });
    q.enqueue({ type: "dec", payload: 3 });
    q.enqueue({ type: "inc", payload: 1 });
    sys.run({ tick: 0 });
    expect(log).toEqual(["+5", "-3", "+1"]);
  });

  it("ignores commands with no handler", () => {
    const q = new CommandQueue<{ type: "known"; payload: number } | { type: "unknown"; payload: number }>();
    const sys = new CommandSystem(q);
    sys.register("known", () => { /* ok */ });
    q.enqueue({ type: "unknown", payload: 0 });
    // Should not throw
    expect(() => sys.run({ tick: 0 })).not.toThrow();
  });
});
