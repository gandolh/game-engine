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

  it("dispose() stops further events from being appended", () => {
    const panel = createChroniclePanel({ ticksPerDay: TICKS_PER_DAY, onSelectAgent: vi.fn() });
    panel.dispose();
    ingestEvents([{ tick: 20, ontology: ONT_FAMILY.DEATH, agentId: 1, cause: "oldAge" }]);
    expect(panel.el.querySelectorAll(".hollow-chronicle-row")).toHaveLength(0);
  });
});
