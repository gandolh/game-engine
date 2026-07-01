import { describe, it, expect, beforeEach } from "vitest";
import { resetNodeIds } from "@engine/ui";
import type { LabelNode } from "@engine/ui";
import { createTooltip } from "./tooltip";

describe("createTooltip", () => {
  beforeEach(() => {
    resetNodeIds();
  });

  it("starts hidden (opacity 0) before any refresh with a label", () => {
    const tooltip = createTooltip();
    expect(tooltip.root.opacity).toBe(0);
    expect(tooltip.isVisible()).toBe(false);
  });

  it("refresh with a label shows the tooltip and sets the title text", () => {
    const tooltip = createTooltip();
    const changed = tooltip.refresh({ label: "Tomato" });
    expect(changed).toBe(true);
    expect(tooltip.root.opacity).toBe(1);
    expect(tooltip.isVisible()).toBe(true);

    const column = tooltip.root.children[0]!;
    const titleLbl = column.children[0] as LabelNode;
    expect(titleLbl.text).toBe("Tomato");
  });

  it("refresh with label === null hides the tooltip", () => {
    const tooltip = createTooltip();
    tooltip.refresh({ label: "Tomato" });
    const changed = tooltip.refresh({ label: null });
    expect(changed).toBe(true);
    expect(tooltip.root.opacity).toBe(0);
    expect(tooltip.isVisible()).toBe(false);
  });

  it("description text is wrapped to multiple lines when it exceeds the wrap width", () => {
    const tooltip = createTooltip();
    const longDescription =
      "A juicy red tomato, freshly picked from the vine, ready to sell at market or cook into a hearty stew.";
    tooltip.refresh({ label: "Tomato", description: longDescription });

    const column = tooltip.root.children[0]!;
    const descLbl = column.children[1] as LabelNode;
    expect(descLbl.text).toContain("\n");
    expect(descLbl.text.replace(/\n/g, " ")).toBe(longDescription);
  });

  it("no description leaves the description label empty", () => {
    const tooltip = createTooltip();
    tooltip.refresh({ label: "Tomato" });
    const column = tooltip.root.children[0]!;
    const descLbl = column.children[1] as LabelNode;
    expect(descLbl.text).toBe("");
  });

  it("refresh returns false when nothing layout-affecting changed", () => {
    const tooltip = createTooltip();
    tooltip.refresh({ label: "Tomato", description: "desc" });
    const again = tooltip.refresh({ label: "Tomato", description: "desc" });
    expect(again).toBe(false);
  });
});
