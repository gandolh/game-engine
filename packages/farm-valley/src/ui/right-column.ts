import { createEl, applyStyles } from "./dom";

/**
 * brief 25 — shared top-right column.
 *
 * The ObserverPanel and the EventFeedPanel both used to anchor themselves to
 * `position: fixed; top: 0; right: 0`, so they stacked on the same corner and
 * the higher-z observer covered the activity feed entirely. This container is
 * the single fixed right-edge column; both panels mount into it as flex
 * children (observer on top, activity below) and reflow automatically when the
 * observer grows (e.g. the focused-farmer "why" block expands its height).
 */
const COLUMN_STYLES: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  top: "0",
  right: "0",
  width: "300px",
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  // Children manage their own borders/background; the column just stacks them
  // and lets the feed take the leftover space below the observer.
  alignItems: "stretch",
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
