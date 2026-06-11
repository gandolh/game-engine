import { EDG } from "@engine/core/render";

// Flex child of the shared right column; flexShrink:0 so the feed below it is never squeezed.
// Capped well below half the viewport (was 70vh, which starved the Activity feed) — the
// farmer list scrolls internally past the cap, leaving room for the panels below.
export const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  width: "100%",
  maxHeight: "40vh",
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
