import { createEl, applyStyles } from "./dom";
import { EDG } from "@engine/core/render";

// Single fixed right-edge column; panels stack as flex children so they never overlap.
const COLUMN_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  right: "0",
  width: "300px",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  // Solid backdrop so the sidebar reads as one full-height surface even when every
  // category is collapsed and the stacked panels don't reach the bottom.
  background: EDG.black,
  // Safety net: if the stacked panels ever exceed the viewport, scroll the whole
  // column rather than clipping the bottom panel off-screen.
  overflowY: "auto",
  pointerEvents: "none",
  zIndex: "9997",
  boxSizing: "border-box",
};

export function createRightColumn(parent: HTMLElement): HTMLElement {
  const col = createEl("div");
  applyStyles(col, COLUMN_STYLES);
  col.dataset["rightColumn"] = "";
  parent.appendChild(col);
  return col;
}
