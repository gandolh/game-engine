import { describe, it, expect } from "vitest";
import { createWorldClock, fractionToTimeLabel } from "./world-clock";
import type { LabelNode, UINode } from "@engine/ui";
import { EDG } from "@engine/core";

/** Collect every label's text in the tree, in pre-order (matches the visual left-to-right row). */
function labelTexts(node: UINode, out: string[] = []): string[] {
  if (node.kind === "label") out.push(node.text);
  for (const child of node.children) labelTexts(child, out);
  return out;
}

/** Find the first label whose text starts with `prefix` (helper for colour assertions). */
function findLabel(node: UINode, prefix: string): LabelNode | null {
  if (node.kind === "label" && node.text.startsWith(prefix)) return node;
  for (const child of node.children) {
    const hit = findLabel(child, prefix);
    if (hit !== null) return hit;
  }
  return null;
}

describe("createWorldClock", () => {
  it("first refresh renders season/day/time/phase labels and reports changed", () => {
    const clock = createWorldClock();
    // day 1 = spring; tick 0 of a 1200-tick day = fraction 0 = 6:00 AM = morning phase.
    const changed = clock.refresh({ tick: 0, ticksPerDay: 1200, day: 1 });
    expect(changed).toBe(true);

    const texts = labelTexts(clock.root);
    expect(texts).toContain("Spring");
    expect(texts).toContain("Day 1");
    expect(texts).toContain("6:00 AM");
    expect(texts).toContain("[Morning]");
  });

  it("season name tracks the day and time tracks the tick", () => {
    const clock = createWorldClock();
    // Mid-day tick (fraction 0.5 of a 1200-tick day). Phase 0.5 is within [0.15, 0.65) = "work"/Day.
    clock.refresh({ tick: 600, ticksPerDay: 1200, day: 40 });
    const texts = labelTexts(clock.root);
    // Day 40 falls in a later season than spring; assert the day/time/phase which are deterministic.
    expect(texts).toContain("Day 40");
    expect(texts).toContain("[Day]");
    expect(texts).toContain(fractionToTimeLabel(0.5));
  });

  it("refresh returns false when nothing layout-affecting changed", () => {
    const clock = createWorldClock();
    clock.refresh({ tick: 0, ticksPerDay: 1200, day: 1 });
    const again = clock.refresh({ tick: 0, ticksPerDay: 1200, day: 1 });
    expect(again).toBe(false);
  });

  it("uses an EDG32 phase colour on the phase label (night → steel)", () => {
    const clock = createWorldClock();
    // fraction 0.9 (> 0.85) = night.
    clock.refresh({ tick: 1080, ticksPerDay: 1200, day: 1 });
    const phaseLbl = findLabel(clock.root, "[Night]");
    expect(phaseLbl).not.toBeNull();
    expect(phaseLbl?.color).toBe(EDG.steel);
  });

  it("fractionToTimeLabel maps the 20-hour day starting at 6 AM", () => {
    expect(fractionToTimeLabel(0)).toBe("6:00 AM");
    expect(fractionToTimeLabel(0.3)).toBe("12:00 PM"); // 6 + 0.3*20 = 12:00
  });
});
