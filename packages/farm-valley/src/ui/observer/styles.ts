import { EDG } from "@engine/core/render";

// brief 25 — the observer is now a flex child of the shared right column
// (ui/right-column.ts), not self-anchored to the corner. It sizes to content
// up to a cap so the activity feed can flow below it; `flexShrink: 0` keeps it
// from being squeezed when the feed fills the rest of the column.
export const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  width: "100%",
  maxHeight: "70vh",
  overflowY: "auto",
  flexShrink: "0",
  pointerEvents: "auto",
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "12px",
  padding: "8px",
  boxSizing: "border-box",
  borderLeft: `1px solid ${EDG.black}`,
  borderBottom: `1px solid ${EDG.black}`,
};
