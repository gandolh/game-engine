import { describe, it, expect } from "vitest";
import { AGENT_COLLISION_RADIUS, separatedAgentPositions } from "./agent-collision";

describe("separatedAgentPositions", () => {
  it("leaves well-separated agents effectively unchanged", () => {
    const positions = new Map([
      [1, { x: 0, y: 0 }],
      [2, { x: 10, y: 10 }],
    ]);
    const out = separatedAgentPositions(positions);
    expect(out.get(1)).toEqual({ x: 0, y: 0 });
    expect(out.get(2)).toEqual({ x: 10, y: 10 });
  });

  it("pushes two agents on the SAME tile apart deterministically", () => {
    const positions = new Map([
      [1, { x: 4, y: 4 }],
      [2, { x: 4, y: 4 }],
    ]);
    const out = separatedAgentPositions(positions);
    const a = out.get(1)!;
    const b = out.get(2)!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // radius sum is 2*AGENT_COLLISION_RADIUS — should be pushed apart toward that.
    expect(dist).toBeGreaterThan(2 * AGENT_COLLISION_RADIUS - 1e-6);
  });

  it("is reproducible across repeat calls (no hidden randomness/time dependence)", () => {
    const positions = new Map([
      [5, { x: 1, y: 1 }],
      [9, { x: 1, y: 1 }],
    ]);
    const run1 = separatedAgentPositions(positions);
    const run2 = separatedAgentPositions(positions);
    expect(run1.get(5)).toEqual(run2.get(5));
    expect(run1.get(9)).toEqual(run2.get(9));
  });

  it("adjacent-tile agents (one grid unit apart) end up just touching, not overlapping", () => {
    const positions = new Map([
      [1, { x: 0, y: 0 }],
      [2, { x: 1, y: 0 }],
    ]);
    const out = separatedAgentPositions(positions);
    const a = out.get(1)!;
    const b = out.get(2)!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeCloseTo(1, 5); // already exactly at the radius-sum boundary
  });
});
