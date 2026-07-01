/**
 * Farm Valley relationship matrix — a farmers x farmers trust grid, rendered IN-CANVAS via
 * `@engine/ui`.
 *
 * Ports the old DOM `ui/relationship-matrix.ts` (`RelationshipMatrixPanel`) onto the
 * create/refresh pattern established by `createResourceHud` (Citadel) / `createWorldClock`
 * (Farm): a retained widget tree built ONCE by {@link createRelationshipMatrix}, then
 * `refresh(data)` rebuilds the grid rows in place when the farmer roster or trust values change
 * (cheap signature check, mirroring the DOM version's `lastSignature` short-circuit).
 *
 * `@engine/ui` has no `<table>` primitive, so the grid is a `box` of row `box`es, each holding one
 * cell `label` per column — a corner blank, a header row of column initials, then one row per
 * farmer (row-label initial + one colour-coded cell per column). Cell colour IS the trust readout
 * (no native title/tooltip in the framework yet); the numeric trust value is embedded in the cell
 * text at low precision so it still reads without hover, matching the DOM legend but staying
 * scannable at a glance via colour.
 *
 * EDG32-only: cell colours mirror the DOM `trustColor` thresds (red <0.35, green >0.65, steel
 * otherwise); header/row-label initials use `personalityColor`.
 */
import { EDG } from "@engine/core";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";
import { personalityColor } from "../colors";

export interface RelationshipMatrixData {
  farmers: Array<{ id: number; name: string; personality: string }>;
  trust: Record<number, Record<number, number>>;
}

function trustColor(value: number): string {
  if (value < 0.35) return EDG.red;
  if (value > 0.65) return EDG.green;
  return EDG.steel;
}

function initial(name: string): string {
  return name.length > 0 ? name.charAt(0).toUpperCase() : "?";
}

function computeSignature(
  farmers: RelationshipMatrixData["farmers"],
  trust: RelationshipMatrixData["trust"],
): string {
  let s = `${farmers.length}:`;
  for (const f of farmers) s += `${f.id}${initial(f.name)}${f.personality[0] ?? ""};`;
  s += "|";
  for (const from of farmers) {
    const row = trust[from.id] ?? {};
    for (const to of farmers) {
      if (from.id === to.id) continue;
      s += `${Math.round((row[to.id] ?? 0.5) * 100)},`;
    }
  }
  return s;
}

/** The retained relationship matrix: its root node plus refresh(). */
export interface RelationshipMatrix {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Rebuild the grid from the latest farmers/trust data. Call once per frame; cheap to call
   * every frame — it short-circuits via an internal signature when nothing changed.
   * @returns `true` when the grid was rebuilt (layout-affecting); `false` when unchanged.
   */
  refresh(data: RelationshipMatrixData): boolean;
}

/**
 * Build the retained relationship-matrix widget tree. The grid body is rebuilt wholesale on
 * change (small N x N farmer count keeps this cheap), matching the DOM version's `replaceChildren`.
 */
export function createRelationshipMatrix(): RelationshipMatrix {
  const title = label("Relationships", { color: EDG.white });
  const caption = label(
    "Who trusts whom - each row toward each column.",
    { color: EDG.steel },
  );
  const legend = box({ direction: "row", gap: 10, align: "center" }, [
    label("ally", { color: EDG.green }),
    label("neutral", { color: EDG.steel }),
    label("rival", { color: EDG.red }),
  ]);
  const gridBox = box({ direction: "column", gap: 2, align: "stretch" }, []);

  const root = panel({ direction: "column", gap: 6, align: "stretch" }, [
    title,
    caption,
    legend,
    gridBox,
  ]);

  let lastSignature = "";

  function buildCell(text: string, color: string): LabelNode {
    return label(text, { color });
  }

  function refresh(data: RelationshipMatrixData): boolean {
    const { farmers, trust } = data;
    const signature = computeSignature(farmers, trust);
    if (signature === lastSignature) return false;
    lastSignature = signature;

    if (farmers.length === 0) {
      gridBox.children = [];
      return true;
    }

    const headerRow = box({ direction: "row", gap: 4, align: "center" }, [
      buildCell(" ", EDG.steel),
      ...farmers.map((f) => buildCell(initial(f.name), personalityColor(f.personality))),
    ]);

    const bodyRows: ContainerNode[] = farmers.map((from) => {
      const rowCells: LabelNode[] = [buildCell(initial(from.name), personalityColor(from.personality))];
      for (const to of farmers) {
        if (from.id === to.id) {
          rowCells.push(buildCell("*", EDG.steel));
        } else {
          const fromRow = trust[from.id] ?? {};
          const value = fromRow[to.id] ?? 0.5;
          rowCells.push(buildCell(String(Math.round(value * 100)), trustColor(value)));
        }
      }
      return box({ direction: "row", gap: 4, align: "center" }, rowCells);
    });

    gridBox.children = [headerRow, ...bodyRows];
    return true;
  }

  return { root, refresh };
}
