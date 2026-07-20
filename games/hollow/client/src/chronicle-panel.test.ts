import { describe, it, expect, afterEach, vi } from "vitest";
import { ONT_FAMILY, ONT_COMMUNITY } from "@hollow/sim-core/protocols";
import { ingestEvents, resetResearchStore } from "./research-store";
import { createChroniclePanel } from "./chronicle-panel";

afterEach(() => {
  resetResearchStore();
});

const TICKS_PER_DAY = 20;

describe("createChroniclePanel", () => {
  it("renders backlog events already in the research store on mount", () => {
    ingestEvents([{ tick: 20, ontology: ONT_FAMILY.BIRTH, householdId: 1, childId: 3, parentAId: 1, parentBId: 2 }]);
    const panel = createChroniclePanel({ ticksPerDay: TICKS_PER_DAY, onSelectAgent: vi.fn() });
    expect(panel.el.querySelectorAll(".hollow-chronicle-row")).toHaveLength(1);
    expect(panel.el.textContent).toContain("welcome");
  });

  it("appends only the new delta, not a rebuild, as further events arrive", () => {
    const panel = createChroniclePanel({ ticksPerDay: TICKS_PER_DAY, onSelectAgent: vi.fn() });
    expect(panel.el.querySelectorAll(".hollow-chronicle-row")).toHaveLength(0);

    ingestEvents([{ tick: 20, ontology: ONT_FAMILY.DEATH, agentId: 5, cause: "oldAge" }]);
    expect(panel.el.querySelectorAll(".hollow-chronicle-row")).toHaveLength(1);

    ingestEvents([{ tick: 40, ontology: ONT_FAMILY.DEATH, agentId: 6, cause: "starvation" }]);
    expect(panel.el.querySelectorAll(".hollow-chronicle-row")).toHaveLength(2);
  });

  it("clicking a row with a resolvable primary actor calls onSelectAgent with that id", () => {
    ingestEvents([{ tick: 20, ontology: ONT_FAMILY.DEATH, agentId: 42, cause: "violence" }]);
    const onSelectAgent = vi.fn();
    const panel = createChroniclePanel({ ticksPerDay: TICKS_PER_DAY, onSelectAgent });
    const row = panel.el.querySelector(".hollow-chronicle-row") as HTMLElement;
    row.click();
    expect(onSelectAgent).toHaveBeenCalledWith(42);
  });

  it("does not attach a click handler for a row with no resolvable actors", () => {
    ingestEvents([{ tick: 20, ontology: "made.up" }]);
    const onSelectAgent = vi.fn();
    const panel = createChroniclePanel({ ticksPerDay: TICKS_PER_DAY, onSelectAgent });
    const row = panel.el.querySelector(".hollow-chronicle-row") as HTMLElement;
    row.click();
    expect(onSelectAgent).not.toHaveBeenCalled();
  });

  it("toggling a category filter hides only that category's rows", () => {
    ingestEvents([
      { tick: 20, ontology: ONT_FAMILY.DEATH, agentId: 1, cause: "oldAge" },
      { tick: 20, ontology: ONT_COMMUNITY.FORMED, communityId: 1, memberIds: [1, 2] },
    ]);
    const panel = createChroniclePanel({ ticksPerDay: TICKS_PER_DAY, onSelectAgent: vi.fn() });
    const rows = panel.el.querySelectorAll<HTMLElement>(".hollow-chronicle-row");
    expect(rows).toHaveLength(2);

    const chips = panel.el.querySelectorAll<HTMLButtonElement>(".hollow-chronicle-chip");
    const deathsChip = [...chips].find((c) => c.textContent === "Deaths");
    expect(deathsChip).toBeDefined();
    deathsChip!.click();

    const visible = [...rows].filter((r) => r.style.display !== "none");
    expect(visible).toHaveLength(1);
    expect(visible[0]!.textContent).toContain("Community");
  });

  it("caps the live DOM as a long run streams events (the freeze fix)", () => {
    const panel = createChroniclePanel({ ticksPerDay: TICKS_PER_DAY, onSelectAgent: vi.fn() });
    const lastRowText = (): string => {
      const rows = panel.el.querySelectorAll<HTMLElement>(".hollow-chronicle-row");
      return rows[rows.length - 1]?.textContent ?? "";
    };
    // Stream well past the row cap (the "app freezes after a minute" bug was
    // unbounded DOM growth — see chronicle-panel.ts's MAX_ROWS note).
    for (let i = 0; i < 1000; i++) {
      ingestEvents([{ tick: i, ontology: ONT_FAMILY.DEATH, agentId: i, cause: "oldAge" }]);
    }
    const rows = panel.el.querySelectorAll<HTMLElement>(".hollow-chronicle-row");
    // Bounded (not ~1000), and the newest event is still the last mounted row.
    expect(rows.length).toBeLessThan(1000);
    expect(rows.length).toBeGreaterThan(0);
    const newest = lastRowText();
    ingestEvents([{ tick: 1000, ontology: ONT_FAMILY.DEATH, agentId: 4242, cause: "violence" }]);
    expect(lastRowText()).not.toBe(newest); // the latest line is always appended live
  });

  it("dispose() stops further events from being appended", () => {
    const panel = createChroniclePanel({ ticksPerDay: TICKS_PER_DAY, onSelectAgent: vi.fn() });
    panel.dispose();
    ingestEvents([{ tick: 20, ontology: ONT_FAMILY.DEATH, agentId: 1, cause: "oldAge" }]);
    expect(panel.el.querySelectorAll(".hollow-chronicle-row")).toHaveLength(0);
  });
});
