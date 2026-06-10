import { describe, it, expect, beforeEach } from "vitest";
import { RelationshipMatrixPanel } from "./relationship-matrix";
import type { RelationshipMatrixData } from "./relationship-matrix";
import { EDG } from "@engine/core/render";

function makeData(trustValues: number[][]): RelationshipMatrixData {
  const n = trustValues.length;
  const farmers = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: ["Cora", "Atticus", "Hannah", "Otto"][i] ?? `F${i + 1}`,
    personality: ["conservative", "aggressive", "hoarder", "opportunist"][i] ?? "conservative",
  }));

  const trust: Record<number, Record<number, number>> = {};
  for (let r = 0; r < n; r++) {
    const fromId = farmers[r]!.id;
    trust[fromId] = {};
    for (let c = 0; c < n; c++) {
      const toId = farmers[c]!.id;
      trust[fromId]![toId] = trustValues[r]![c]!;
    }
  }

  return { farmers, trust };
}

describe("RelationshipMatrixPanel", () => {
  let container: HTMLElement;
  let panel: RelationshipMatrixPanel;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    panel = new RelationshipMatrixPanel(container);
  });

  it("renders an N×N grid of data cells (N=3, plus header row + label col)", () => {
    const n = 3;
    const data = makeData([
      [1, 0.5, 0.5],
      [0.5, 1, 0.5],
      [0.5, 0.5, 1],
    ]);
    panel.update(data);

    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(n); // n data rows

    const cells = container.querySelectorAll("tbody td");
    expect(cells).toHaveLength(n * (n + 1));
  });

  it("renders a 4×4 grid for 4 farmers", () => {
    const n = 4;
    const data = makeData([
      [1, 0.5, 0.5, 0.5],
      [0.5, 1, 0.5, 0.5],
      [0.5, 0.5, 1, 0.5],
      [0.5, 0.5, 0.5, 1],
    ]);
    panel.update(data);

    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(n);

    const cells = container.querySelectorAll("tbody td");
    expect(cells).toHaveLength(n * (n + 1));
  });

  // jsdom normalizes hex to rgb(r, g, b) on .style.background.
  function hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }

  it("hostile trust (< 0.35) → cell background is EDG.red", () => {
    // 2×2: farmer 1→2 trust = 0.1 (hostile)
    const data = makeData([
      [1, 0.1],
      [0.5, 1],
    ]);
    panel.update(data);

    // Row 0, data cell index 1 (col 1, skipping label col) = farmer1→farmer2
    const rows = container.querySelectorAll("tbody tr");
    const firstRow = rows[0]!;
    const cellTo2 = firstRow.querySelectorAll("td")[2] as HTMLElement | undefined;
    expect(cellTo2).toBeDefined();
    expect(cellTo2!.style.background).toBe(hexToRgb(EDG.red));
  });

  it("neutral trust (0.5) → cell background is EDG.steel", () => {
    // 2×2: farmer 1→2 trust = 0.5 (neutral)
    const data = makeData([
      [1, 0.5],
      [0.5, 1],
    ]);
    panel.update(data);

    const rows = container.querySelectorAll("tbody tr");
    const firstRow = rows[0]!;
    const cellTo2 = firstRow.querySelectorAll("td")[2] as HTMLElement | undefined;
    expect(cellTo2).toBeDefined();
    expect(cellTo2!.style.background).toBe(hexToRgb(EDG.steel));
  });

  it("high trust (> 0.65) → cell background is EDG.green", () => {
    // 2×2: farmer 1→2 trust = 0.9 (allied)
    const data = makeData([
      [1, 0.9],
      [0.5, 1],
    ]);
    panel.update(data);

    const rows = container.querySelectorAll("tbody tr");
    const firstRow = rows[0]!;
    const cellTo2 = firstRow.querySelectorAll("td")[2] as HTMLElement | undefined;
    expect(cellTo2).toBeDefined();
    expect(cellTo2!.style.background).toBe(hexToRgb(EDG.green));
  });

  it("diagonal cells (self→self) are blank (dot character)", () => {
    const data = makeData([
      [1, 0.5],
      [0.5, 1],
    ]);
    panel.update(data);

    const rows = container.querySelectorAll("tbody tr");
    // Row 0, cell 1 (index 1 in td list = diagonal for farmer 1)
    const diagCell = rows[0]!.querySelectorAll("td")[1] as HTMLElement;
    expect(diagCell.textContent).toBe("·");
  });

  it("header row contains farmer initials", () => {
    const data = makeData([
      [1, 0.5],
      [0.5, 1],
    ]);
    panel.update(data);

    const headerCells = container.querySelectorAll("thead th");
    const texts = Array.from(headerCells).map((th) => th.textContent ?? "");
    expect(texts).toContain("C");
    expect(texts).toContain("A");
  });

  it("renders empty without crashing when no farmers", () => {
    panel.update({ farmers: [], trust: {} });
    // Should not throw; table container should be cleared.
    const tables = container.querySelectorAll("table");
    expect(tables).toHaveLength(0);
  });

  it("setVisible hides the panel", () => {
    panel.setVisible(false);
    const panelEl = container.querySelector("div") as HTMLElement;
    expect(panelEl.style.display).toBe("none");
  });

  it("destroy removes the panel from the DOM", () => {
    panel.destroy();
    const panelEl = container.querySelector("div");
    expect(panelEl).toBeNull();
  });
});
