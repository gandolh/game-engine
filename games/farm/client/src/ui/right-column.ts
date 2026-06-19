import { createEl, applyStyles } from "./dom";
import { EDG } from "@engine/core/render";

const COLUMN_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  right: "0",
  width: "300px",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",

  background: EDG.black,

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
