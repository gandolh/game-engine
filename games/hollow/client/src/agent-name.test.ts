import { describe, it, expect } from "vitest";
import { agentName } from "./agent-name";

describe("agentName", () => {
  it("is deterministic — same id always yields the same name", () => {
    for (const id of [0, 1, 2, 7, 42, 1000, 999999]) {
      expect(agentName(id)).toBe(agentName(id));
    }
  });

  it("produces a non-empty 'Firstsecond'-shaped string", () => {
    for (const id of [0, 1, 5, 100]) {
      const name = agentName(id);
      expect(name.length).toBeGreaterThan(0);
      expect(name[0]).toBe(name[0]!.toUpperCase());
    }
  });

  it("varies across a spread of ids (not a constant)", () => {
    const names = new Set([...Array(30).keys()].map((id) => agentName(id)));
    expect(names.size).toBeGreaterThan(5);
  });

  it("is stable across negative/zero/large ids without throwing", () => {
    expect(() => agentName(0)).not.toThrow();
    expect(() => agentName(-1)).not.toThrow();
    expect(() => agentName(2 ** 31)).not.toThrow();
  });
});
