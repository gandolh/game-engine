import { describe, it, expect } from "vitest";
import { createPersonalityRegistry } from "./registry";

interface Agent {
  kind: string;
  ran: string[];
}

describe("createPersonalityRegistry", () => {
  it("dispatches a registered deliberator by kind", () => {
    const reg = createPersonalityRegistry<Agent>();
    reg.register("greedy", (agent, ctx) => agent.ran.push(`greedy@${ctx.tick}`));
    const agent: Agent = { kind: "greedy", ran: [] };
    const fn = reg.get(agent.kind);
    expect(fn).toBeDefined();
    fn!(agent, { tick: 7 });
    expect(agent.ran).toEqual(["greedy@7"]);
  });

  it("returns undefined for an unknown kind", () => {
    const reg = createPersonalityRegistry<Agent>();
    expect(reg.get("nope")).toBeUndefined();
    expect(reg.has("nope")).toBe(false);
  });

  it("throws on duplicate registration of the same kind", () => {
    const reg = createPersonalityRegistry<Agent>();
    reg.register("a", () => {});
    expect(() => reg.register("a", () => {})).toThrow(/already registered/);
  });

  it("isolates registries — two instances do not share kinds", () => {
    const a = createPersonalityRegistry<Agent>();
    const b = createPersonalityRegistry<Agent>();
    a.register("x", () => {});
    expect(a.has("x")).toBe(true);
    expect(b.has("x")).toBe(false);
  });
});
