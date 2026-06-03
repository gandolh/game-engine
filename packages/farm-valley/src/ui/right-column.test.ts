import { describe, it, expect, beforeEach } from "vitest";
import { createRightColumn } from "./right-column";
import { ObserverPanel } from "./observer";
import { EventFeedPanel } from "./event-feed-panel";

describe("right-column (brief 25 — panel overlap fix)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("is a single fixed flex column anchored top-right", () => {
    const col = createRightColumn(root);
    expect(col.style.position).toBe("fixed");
    expect(col.style.top).toBe("0px");
    expect(col.style.right).toBe("0px");
    expect(col.style.flexDirection).toBe("column");
    expect(col.dataset["rightColumn"]).toBe("");
  });

  it("stacks the observer above the activity feed (DOM order), neither fixed-positioned", () => {
    const col = createRightColumn(root);
    new ObserverPanel(col);
    new EventFeedPanel(col);

    // Two children, observer first, feed second.
    expect(col.children.length).toBe(2);
    const [first, second] = [
      col.children[0] as HTMLElement,
      col.children[1] as HTMLElement,
    ];
    // Panels flow inside the column — they must NOT self-anchor (which was the
    // overlap bug). The column owns the fixed positioning, not the panels.
    expect(first.style.position).not.toBe("fixed");
    expect(second.style.position).not.toBe("fixed");
  });

  it("lets the feed take leftover space while the observer keeps its content height", () => {
    const col = createRightColumn(root);
    new ObserverPanel(col);
    new EventFeedPanel(col);
    const observerEl = col.children[0] as HTMLElement;
    const feedEl = col.children[1] as HTMLElement;
    // Observer doesn't shrink; feed grows to fill — so they never overlap.
    expect(observerEl.style.flexShrink).toBe("0");
    expect(feedEl.style.flex).toContain("1");
  });
});
