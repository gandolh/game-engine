import { EDG } from "@engine/core/render";

export const PANEL_STYLES: Partial<CSSStyleDeclaration> = {
  background: EDG.black,
  color: EDG.silver,
  fontFamily: "monospace",
  fontSize: "11px",
  boxSizing: "border-box",
  borderTop: `1px solid ${EDG.ink}`,
  pointerEvents: "auto",
  flexShrink: "0",
};

export const HEADER_STYLES: Partial<CSSStyleDeclaration> = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "4px 8px",
  borderBottom: `1px solid ${EDG.ink}`,
  cursor: "pointer",
  userSelect: "none",
};

export const HEADER_TITLE_STYLES: Partial<CSSStyleDeclaration> = {
  fontWeight: "bold",
  fontSize: "12px",
  color: EDG.white,
};

export const TOGGLE_STYLES: Partial<CSSStyleDeclaration> = {
  fontSize: "10px",
  color: EDG.steel,
  marginLeft: "6px",
};

export const CANVAS_WRAPPER_STYLES: Partial<CSSStyleDeclaration> = {
  padding: "4px 8px 6px",
};

export const CHART_WIDTH = 276;
export const CHART_HEIGHT = 120;

export const PAD_LEFT = 28;
export const PAD_RIGHT = 6;
export const PAD_TOP = 6;
export const PAD_BOTTOM = 20;
