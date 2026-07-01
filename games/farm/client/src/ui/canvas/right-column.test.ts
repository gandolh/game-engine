import { describe, it, expect } from "vitest";
import { createRightColumn } from "./right-column";
import type { RightColumnState } from "./right-column";
import type { ObserverSnapshot } from "@farm/sim-core/snapshot";

function makeSnapshot(): ObserverSnapshot {
  return {
    day: 1,
    season: "spring",
    weather: { condition: "sunny", multiplier: 1 },
    forecast: [],
    farmers: [],
  };
}

function makeState(overrides: Partial<RightColumnState> = {}): RightColumnState {
  return {
    observer: makeSnapshot(),
    slate: [],
    events: [],
    ...overrides,
  };
}

describe("createRightColumn", () => {
  it("composes the three sub-panels' roots as children of ONE root", () => {
    const col = createRightColumn({ onSelectFarmer: () => {} });
    expect(col.root.children).toContain(col.observerPanel.root);
    expect(col.root.children).toContain(col.slateBillboard.root);
    expect(col.root.children).toContain(col.eventFeed.root);
    expect(col.root.children.length).toBe(3);
  });

  it("refresh fans out to every sub-panel and reports changed on first call", () => {
    const col = createRightColumn({ onSelectFarmer: () => {} });
    const changed = col.refresh(makeState());
    expect(changed).toBe(true);
  });

  it("refresh returns false once nothing layout-affecting changed anywhere", () => {
    const col = createRightColumn({ onSelectFarmer: () => {} });
    col.refresh(makeState());
    const again = col.refresh(makeState());
    expect(again).toBe(false);
  });

  it("routes a wheel event to the sub-panel under the pointer", () => {
    const col = createRightColumn({ onSelectFarmer: () => {} });
    col.refresh(makeState());

    // Force known rects so hit-testing is deterministic in this unit test.
    col.observerPanel.root.rect = { x: 0, y: 0, width: 100, height: 50 };
    col.slateBillboard.root.rect = { x: 0, y: 50, width: 100, height: 50 };
    col.eventFeed.root.rect = { x: 0, y: 100, width: 100, height: 50 };

    expect(col.wheel(10, 10, 5)).toBe(true); // over observer panel
    expect(col.wheel(10, 60, 5)).toBe(true); // over slate billboard
    expect(col.wheel(10, 999, 5)).toBe(false); // over nothing
  });

  it("drawIcons does not throw", () => {
    const col = createRightColumn({ onSelectFarmer: () => {} });
    col.refresh(makeState());
    const surface = {
      begin: () => {},
      push: () => {},
      rect: () => {},
      sprite: () => {},
      end: () => {},
    };
    expect(() => col.drawIcons(surface as unknown as Parameters<typeof col.drawIcons>[0])).not.toThrow();
  });
});
