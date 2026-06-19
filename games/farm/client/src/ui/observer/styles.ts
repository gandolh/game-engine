import { EDG } from "@engine/core/render";

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
