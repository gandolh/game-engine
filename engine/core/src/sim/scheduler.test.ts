/**
 * audit-57 — the Scheduler branch every game actually runs.
 *
 * `tick()` has two branches, and the only test file was `scheduler-audit.test.ts`, whose every test
 * calls `enableStageAudit(bus)` first. So the production `else` — the one all four games run — was
 * reached only indirectly, through `bootstrapSim()`-driven game tests that are asserting something
 * else entirely. `stages()` and the `.stage()` grouping semantics had no test at all.
 *
 * That matters more here than in most repos because CLAUDE.md calls the ordering load-bearing:
 * "the ordering encodes real data dependencies" (EncounterSystem → EncounterTradeSystem →
 * PerceiveSystem, which clears inboxes; EventFeed must snoop before PerceiveSystem clears). A
 * silent reorder — or a guard added to only one branch — is a whole-game behaviour change with no
 * red test.
 *
 * These pin the CONTRACT, not the implementation: what order systems run in, and that **the two
 * branches agree**.
 */
import { describe, it, expect } from "vitest";
import { Scheduler } from "./scheduler";
import type { AuditBus, SimContext, System } from "./scheduler";

/** A system that appends its name to `log` when it runs. */
function spy(name: string, log: string[], onRun?: (ctx: SimContext) => void): System {
  return {
    name,
    run(ctx) {
      log.push(name);
      onRun?.(ctx);
    },
  };
}

/** Records the audit callbacks interleaved with system runs. */
function auditSpy(log: string[]): AuditBus {
  return {
    setStage: (stage) => log.push(`stage:${stage}`),
    endTickAudit: () => log.push("endTickAudit"),
  };
}

describe("Scheduler.tick — the production branch (audit OFF)", () => {
  it("runs systems in registration order, exactly once each", () => {
    const log: string[] = [];
    const s = new Scheduler();
    s.add(spy("A", log)).add(spy("B", log)).add(spy("C", log));

    s.tick({ tick: 0 });

    expect(log).toEqual(["A", "B", "C"]);
  });

  it("preserves order across repeated ticks", () => {
    const log: string[] = [];
    const s = new Scheduler();
    s.add(spy("A", log)).add(spy("B", log)).add(spy("C", log));

    s.tick({ tick: 0 });
    s.tick({ tick: 1 });

    expect(log).toEqual(["A", "B", "C", "A", "B", "C"]);
  });

  it("passes the same SimContext to every system", () => {
    const seen: SimContext[] = [];
    const log: string[] = [];
    const s = new Scheduler();
    const capture = (ctx: SimContext): void => { seen.push(ctx); };
    s.add(spy("A", log, capture)).add(spy("B", log, capture));

    const ctx = { tick: 42 };
    s.tick(ctx);

    expect(seen).toEqual([ctx, ctx]);
    expect(seen.every((c) => c.tick === 42)).toBe(true);
  });

  it("registration order wins over registration STAGE — stages group, they do not reorder", () => {
    // A real trap: `.stage()` reads like a phase declaration, so someone could reasonably expect
    // same-stage systems to be gathered together. They are not — it only labels.
    const log: string[] = [];
    const s = new Scheduler();
    s.stage("early").add(spy("A", log));
    s.stage("late").add(spy("B", log));
    s.stage("early").add(spy("C", log)); // back to "early", but still runs THIRD

    s.tick({ tick: 0 });

    expect(log).toEqual(["A", "B", "C"]);
  });

  it("a ticking scheduler with no systems is a no-op, not a throw", () => {
    expect(() => { new Scheduler().tick({ tick: 0 }); }).not.toThrow();
  });

  it("a throwing system propagates — it does not silently skip the rest", () => {
    // Deliberate, and load-bearing: a partial tick is a world state no clean tick could produce,
    // so the hosts halt the run on it (Farm's tick-fault policy, decisions.md). Swallowing here
    // would advance onto exactly that state.
    const log: string[] = [];
    const s = new Scheduler();
    s.add(spy("A", log));
    s.add({ name: "boom", run: () => { throw new Error("boom"); } });
    s.add(spy("C", log));

    expect(() => { s.tick({ tick: 0 }); }).toThrow("boom");
    expect(log).toEqual(["A"]); // C never ran
  });
});

describe("Scheduler.tick — the two branches agree (audit ON vs OFF)", () => {
  it("runs the same systems in the same order with the audit enabled", () => {
    const build = (): { log: string[]; s: Scheduler } => {
      const log: string[] = [];
      const s = new Scheduler();
      s.stage("perceive").add(spy("A", log));
      s.stage("act").add(spy("B", log)).add(spy("C", log));
      return { log, s };
    };

    const plain = build();
    plain.s.tick({ tick: 7 });

    const audited = build();
    audited.s.enableStageAudit(auditSpy([]));
    audited.s.tick({ tick: 7 });

    // THE POINT OF THIS TEST: the branches must not drift. A guard added to one, or a reorder
    // introduced while adding per-system profiling, would show up right here.
    expect(audited.log).toEqual(plain.log);
    expect(plain.log).toEqual(["A", "B", "C"]);
  });

  it("emits setStage before each system and endTickAudit once, at the end", () => {
    const log: string[] = [];
    const s = new Scheduler();
    s.stage("perceive").add(spy("A", log));
    s.stage("act").add(spy("B", log)).add(spy("C", log));
    s.enableStageAudit(auditSpy(log));

    s.tick({ tick: 0 });

    expect(log).toEqual([
      "stage:perceive", "A",
      "stage:act", "B",
      "stage:act", "C",
      "endTickAudit",
    ]);
  });

  it("labels a system registered before any .stage() call with the empty stage", () => {
    const log: string[] = [];
    const s = new Scheduler();
    s.add(spy("A", log));               // no stage set yet
    s.stage("act").add(spy("B", log));
    s.enableStageAudit(auditSpy(log));

    s.tick({ tick: 0 });

    expect(log).toEqual(["stage:", "A", "stage:act", "B", "endTickAudit"]);
  });
});

describe("Scheduler.stages()", () => {
  it("returns one {stage, name} pair per system, in registration order", () => {
    const log: string[] = [];
    const s = new Scheduler();
    s.stage("perceive").add(spy("Perceive", log));
    s.stage("act").add(spy("Act", log)).add(spy("Trade", log));

    expect(s.stages()).toEqual([
      { stage: "perceive", name: "Perceive" },
      { stage: "act", name: "Act" },
      { stage: "act", name: "Trade" },
    ]);
  });

  it("defaults the stage to the empty string before any .stage() call", () => {
    const s = new Scheduler();
    s.add(spy("A", []));
    expect(s.stages()).toEqual([{ stage: "", name: "A" }]);
  });

  it("is empty for a fresh scheduler", () => {
    expect(new Scheduler().stages()).toEqual([]);
  });

  it("reports the stage in force AT REGISTRATION, not the latest one set", () => {
    const s = new Scheduler();
    s.stage("early").add(spy("A", []));
    s.stage("late").add(spy("B", []));
    s.stage("later-still"); // set after both registrations — must change nothing

    expect(s.stages()).toEqual([
      { stage: "early", name: "A" },
      { stage: "late", name: "B" },
    ]);
  });

  it("does not run systems", () => {
    const log: string[] = [];
    const s = new Scheduler();
    s.add(spy("A", log));
    s.stages();
    expect(log).toEqual([]);
  });
});

describe("Scheduler builder methods chain", () => {
  it("stage/add/enableStageAudit all return the scheduler", () => {
    const s = new Scheduler();
    expect(s.stage("x")).toBe(s);
    expect(s.add(spy("A", []))).toBe(s);
    expect(s.enableStageAudit(auditSpy([]))).toBe(s);
  });
});
