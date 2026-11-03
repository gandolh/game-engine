import { describe, it, expect } from "vitest";
import { createImmediateUi } from "./immediate";
import type { ImmediateUi } from "./immediate";
import type { ButtonNode, ContainerNode, LabelNode } from "../widget";
import { computeLayout } from "../layout";
import { assertFitsViewport, MIN_VIEWPORT } from "../layout/fits-viewport";

/**
 * A small sample screen: a panel with a title, a count, two buttons, and an extra row that
 * only shows while `open` is true.
 */
interface Model {
  count: number;
  open: boolean;
}

function sampleScreen(ui: ImmediateUi, m: Model, log: string[]) {
  return ui.frame(() => {
    ui.panel("root", { direction: "column", gap: 4, padding: 8 }, () => {
      ui.label("title", "Sample");
      ui.label("count", `Count: ${m.count}`);
      ui.box("row", { direction: "row", gap: 4 }, () => {
        if (ui.button("add", "Add")) log.push("add");
        if (ui.button("toggle", m.open ? "Close" : "Open")) log.push("toggle");
      });
      if (m.open) {
        ui.box("extra", { direction: "row" }, () => {
          ui.label("extra.text", "More");
        });
      }
    });
  });
}

const btn = (ui: ImmediateUi, key: string) => ui.node(key) as ButtonNode;

describe("@engine/ui immediate mode", () => {
  it("keeps the same node object for a key across frames", () => {
    const ui = createImmediateUi();
    const log: string[] = [];
    const a = sampleScreen(ui, { count: 0, open: false }, log);
    const add = btn(ui, "add");
    const title = ui.node("title");
    const b = sampleScreen(ui, { count: 1, open: true }, log);
    expect(b.root).toBe(a.root);
    expect(btn(ui, "add")).toBe(add);
    expect(ui.node("title")).toBe(title);
  });

  it("reports a change on the first frame, a text change and a structural change, and not otherwise", () => {
    const ui = createImmediateUi();
    const log: string[] = [];
    expect(sampleScreen(ui, { count: 0, open: false }, log).changed).toBe(true);
    expect(sampleScreen(ui, { count: 0, open: false }, log).changed).toBe(false);
    expect(sampleScreen(ui, { count: 1, open: false }, log).changed).toBe(true);
    expect(sampleScreen(ui, { count: 1, open: false }, log).changed).toBe(false);
    expect(sampleScreen(ui, { count: 1, open: true }, log).changed).toBe(true);
    expect(sampleScreen(ui, { count: 1, open: true }, log).changed).toBe(false);
  });

  it("delivers a click on the frame after activation, once", () => {
    const ui = createImmediateUi();
    const log: string[] = [];
    sampleScreen(ui, { count: 0, open: false }, log);
    btn(ui, "add").onActivate?.();
    expect(log).toEqual([]);
    sampleScreen(ui, { count: 0, open: false }, log);
    expect(log).toEqual(["add"]);
    sampleScreen(ui, { count: 0, open: false }, log);
    expect(log).toEqual(["add"]);
  });

  it("drops a click on a button the next frame does not emit", () => {
    const ui = createImmediateUi();
    const ghost: string[] = [];
    ui.frame(() => {
      ui.panel("root", {}, () => {
        if (ui.button("once", "Once")) ghost.push("once");
      });
    });
    btn(ui, "once").onActivate?.();
    ui.frame(() => ui.panel("root", {}, () => ui.label("x", "gone")));
    ui.frame(() => {
      ui.panel("root", {}, () => {
        if (ui.button("once", "Once")) ghost.push("once");
      });
    });
    expect(ghost).toEqual([]);
  });

  it("removes a hidden subtree from the tree but keeps its node while it comes back within the eviction window", () => {
    const ui = createImmediateUi({ evictAfter: 3 });
    const log: string[] = [];
    sampleScreen(ui, { count: 0, open: true }, log);
    const extra = ui.node("extra") as ContainerNode;
    const root = sampleScreen(ui, { count: 0, open: false }, log).root;
    expect(root.children).not.toContain(extra);
    sampleScreen(ui, { count: 0, open: false }, log);
    sampleScreen(ui, { count: 0, open: true }, log); // unseen for 2 frames: kept
    expect(ui.node("extra")).toBe(extra);
  });

  it("evicts a key unseen for evictAfter frames; it comes back as a fresh node", () => {
    const ui = createImmediateUi({ evictAfter: 3 });
    const log: string[] = [];
    sampleScreen(ui, { count: 0, open: true }, log);
    const extra = ui.node("extra") as ContainerNode;
    const text = ui.node("extra.text") as LabelNode;
    for (let i = 0; i < 3; i++) sampleScreen(ui, { count: 0, open: false }, log);
    expect(ui.node("extra")).toBeUndefined();
    expect(ui.node("extra.text")).toBeUndefined();
    sampleScreen(ui, { count: 0, open: true }, log);
    expect(ui.node("extra")).not.toBe(extra);
    expect(ui.node("extra.text")).not.toBe(text);
  });

  it("drops a pending click on an evicted button", () => {
    const ui = createImmediateUi({ evictAfter: 1 });
    const hits: string[] = [];
    const frame = (show: boolean) =>
      ui.frame(() => {
        ui.panel("root", {}, () => {
          if (show && ui.button("b", "B")) hits.push("b");
          ui.label("l", "x");
        });
      });
    frame(true);
    btn(ui, "b").onActivate?.();
    frame(false); // evicted here, click dropped with it
    frame(true);
    expect(hits).toEqual([]);
  });

  it("refuses a frame with no root, and a second root", () => {
    const ui = createImmediateUi();
    expect(() => ui.frame(() => {})).toThrow(/no root container/);
    expect(() =>
      ui.frame(() => {
        ui.panel("a", {});
        ui.panel("b", {});
      }),
    ).toThrow(/outside the frame's single root/);
  });

  it("marks a button disabled and back, and lays out within MIN_VIEWPORT", () => {
    const ui = createImmediateUi();
    const frame = (disabled: boolean) =>
      ui.frame(() => {
        ui.panel("root", { direction: "column", padding: 8 }, () => {
          ui.button("go", "Go", { disabled });
        });
      });
    const { root } = frame(true);
    expect(btn(ui, "go").state).toBe("disabled");
    frame(false);
    expect(btn(ui, "go").state).toBe("normal");
    computeLayout(root, 0, 0);
    assertFitsViewport(root, MIN_VIEWPORT);
  });
});
