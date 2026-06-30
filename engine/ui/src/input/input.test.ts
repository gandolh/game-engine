import { describe, expect, it, beforeEach, vi } from "vitest";
import { computeLayout } from "../layout/layout";
import { DEFAULT_THEME } from "../theme/theme";
import { box, button, checkbox, label, panel, slider, resetNodeIds } from "../widget/node";
import type { UINode } from "../widget/node";
import { createInputDispatcher } from "./dispatcher";
import type { DragEvent } from "./dispatcher";
import { hitTest } from "./hit-test";

beforeEach(() => resetNodeIds());

/** Center point of a node's laid-out rect. */
function center(node: UINode): [number, number] {
  return [node.rect.x + node.rect.width / 2, node.rect.y + node.rect.height / 2];
}

describe("hitTest — topmost / overlap / pass-through", () => {
  it("returns the deepest hittable node under a point", () => {
    const btn = button("Go");
    const root = panel({ padding: 4 }, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);

    expect(hitTest(root, ...center(btn))).toBe(btn);
  });

  it("a panel captures clicks not on a child (chrome is opaque)", () => {
    const btn = button("Go");
    const root = panel({ padding: 20 }, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);

    // Top-left corner of the padded panel, away from the button.
    expect(hitTest(root, root.rect.x + 1, root.rect.y + 1)).toBe(root);
  });

  it("a bare box is pass-through but is still descended into", () => {
    const btn = button("Go");
    const grouping = box({ padding: 20 }, [btn]); // background:false
    const root = panel({}, [grouping]);
    computeLayout(root, 0, 0, DEFAULT_THEME);

    // Over the box's padding (not the button): box is transparent, so the panel behind wins.
    expect(hitTest(root, grouping.rect.x + 1, grouping.rect.y + 1)).toBe(root);
    // Over the button: the box is descended into and the button is the hit.
    expect(hitTest(root, ...center(btn))).toBe(btn);
  });

  it("a miss returns null", () => {
    const root = panel({}, [button("Go")]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    expect(hitTest(root, 9999, 9999)).toBeNull();
  });

  it("later siblings draw on top, so overlapping rects resolve to the later one", () => {
    const a = button("A");
    const b = button("B");
    const root = box({}, [a, b]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    // Force them to overlap.
    a.rect = { x: 0, y: 0, width: 100, height: 100 };
    b.rect = { x: 0, y: 0, width: 100, height: 100 };
    root.rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(hitTest(root, 50, 50)).toBe(b);
  });
});

describe("hover / active state from pointer events", () => {
  it("hover on pointer-over, restored on leave", () => {
    const btn = button("Go");
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    const r = d.pointerMove(...center(btn));
    expect(r.consumed).toBe(true);
    expect(btn.state).toBe("hover");

    d.pointerMove(9999, 9999);
    expect(btn.state).toBe("normal");
  });

  it("active on press, returns to hover on release over the button", () => {
    const btn = button("Go");
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);
    const [x, y] = center(btn);

    d.pointerMove(x, y);
    d.pointerDown(x, y);
    expect(btn.state).toBe("active");
    d.pointerUp(x, y);
    expect(btn.state).toBe("hover");
  });
});

describe("click activation", () => {
  it("fires onActivate on press+release over the same button", () => {
    const onActivate = vi.fn();
    const btn = button("Go", { onActivate });
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);
    const [x, y] = center(btn);

    d.pointerDown(x, y);
    const r = d.pointerUp(x, y);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(r.consumed).toBe(true);
  });

  it("does NOT fire when release is off the pressed button", () => {
    const onActivate = vi.fn();
    const btn = button("Go", { onActivate });
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);
    const [x, y] = center(btn);

    d.pointerDown(x, y);
    d.pointerUp(9999, 9999);
    expect(onActivate).not.toHaveBeenCalled();
    expect(btn.state).toBe("normal");
  });

  it("a miss reports not-consumed so the host falls through to the world", () => {
    const root = panel({}, [button("Go")]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    expect(d.pointerDown(9999, 9999).consumed).toBe(false);
    expect(d.pointerUp(9999, 9999).consumed).toBe(false);
    expect(d.pointerMove(9999, 9999).consumed).toBe(false);
  });
});

describe("disabled buttons are inert", () => {
  it("no hover, no active, no activation", () => {
    const onActivate = vi.fn();
    const btn = button("Go", { onActivate, state: "disabled" });
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);
    const [x, y] = center(btn);

    d.pointerMove(x, y);
    expect(btn.state).toBe("disabled");
    d.pointerDown(x, y);
    expect(btn.state).toBe("disabled");
    d.pointerUp(x, y);
    expect(btn.state).toBe("disabled");
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe("focus traversal + keyboard activation", () => {
  it("Tab visits focusables in tree order and wraps; Shift-Tab reverses", () => {
    const a = button("A");
    const b = button("B");
    const c = button("C");
    const root = panel({}, [a, box({}, [b]), c]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    expect(d.focused()).toBeNull();
    d.key({ key: "Tab" });
    expect(d.focused()).toBe(a);
    d.key({ key: "Tab" });
    expect(d.focused()).toBe(b);
    d.key({ key: "Tab" });
    expect(d.focused()).toBe(c);
    d.key({ key: "Tab" }); // wrap
    expect(d.focused()).toBe(a);
    d.key({ key: "Tab", shiftKey: true }); // reverse-wrap
    expect(d.focused()).toBe(c);
  });

  it("skips disabled buttons in traversal", () => {
    const a = button("A");
    const dis = button("X", { state: "disabled" });
    const c = button("C");
    const root = panel({}, [a, dis, c]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    d.key({ key: "Tab" });
    expect(d.focused()).toBe(a);
    d.key({ key: "Tab" });
    expect(d.focused()).toBe(c);
  });

  it("Enter and Space activate the focused button", () => {
    const onA = vi.fn();
    const onB = vi.fn();
    const a = button("A", { onActivate: onA });
    const b = button("B", { onActivate: onB });
    const root = panel({}, [a, b]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    d.focus(b);
    expect(d.key({ key: "Enter" }).consumed).toBe(true);
    expect(onB).toHaveBeenCalledTimes(1);
    expect(d.key({ key: " " }).consumed).toBe(true);
    expect(onB).toHaveBeenCalledTimes(2);
    expect(onA).not.toHaveBeenCalled();
  });

  it("focus(id) and blur work; non-Tab/activation keys are not consumed", () => {
    const a = button("A");
    const root = panel({}, [a]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    d.focus(a.id);
    expect(d.focused()).toBe(a);
    d.blur();
    expect(d.focused()).toBeNull();
    expect(d.key({ key: "Escape" }).consumed).toBe(false);
  });
});

describe("drag", () => {
  it("reports start/move/end with the originating node and screen delta", () => {
    const events: DragEvent[] = [];
    const btn = button("Drag");
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root, { onDrag: (e) => events.push({ ...e }) });
    const [x, y] = center(btn);

    d.pointerDown(x, y);
    d.pointerMove(x + 10, y + 5);
    d.pointerMove(x + 20, y + 5);
    d.pointerUp(x + 20, y + 5);

    expect(events.map((e) => e.phase)).toEqual(["start", "move", "move", "end"]);
    expect(events[0]!.node).toBe(btn);
    const end = events[events.length - 1]!;
    expect(end.dx).toBe(20);
    expect(end.dy).toBe(5);
  });

  it("a press+release with no movement is a click, not a drag", () => {
    const events: DragEvent[] = [];
    const onActivate = vi.fn();
    const btn = button("Go", { onActivate });
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root, {
      onDrag: (e) => events.push(e),
      dragThreshold: 3,
    });
    const [x, y] = center(btn);

    d.pointerDown(x, y);
    d.pointerUp(x, y);
    expect(events).toHaveLength(0);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("movement beyond the drag threshold suppresses the click", () => {
    const onActivate = vi.fn();
    const btn = button("Go", { onActivate });
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root, { dragThreshold: 3 });
    const [x, y] = center(btn);

    d.pointerDown(x, y);
    d.pointerMove(x + 10, y); // exceeds threshold → drag, not click
    d.pointerUp(x + 10, y);
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe("slider input — track click, drag, keyboard", () => {
  it("a press jumps the value to the pointer x (track click) and sets active", () => {
    const onChange = vi.fn();
    const s = slider({ min: 0, max: 100, value: 0, onChange, layout: { width: 100 } });
    const root = panel({ padding: 0 }, [s]);
    computeLayout(root, 0, 0, DEFAULT_THEME); // track spans s.rect = [0,100]

    const d = createInputDispatcher(() => root);
    d.pointerDown(75, s.rect.y + 2);
    expect(s.value).toBe(75);
    expect(s.state).toBe("active");
    expect(onChange).toHaveBeenLastCalledWith(75);
    d.pointerUp(75, s.rect.y + 2);
  });

  it("dragging moves the value and routes through onDrag too", () => {
    const events: DragEvent[] = [];
    const onChange = vi.fn();
    const s = slider({ min: 0, max: 100, value: 0, onChange, layout: { width: 100 } });
    const root = panel({ padding: 0 }, [s]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root, { onDrag: (e) => events.push({ ...e }) });
    const y = s.rect.y + 2;

    d.pointerDown(10, y); // value 10
    d.pointerMove(40, y); // drag → value 40
    d.pointerMove(90, y); // value 90
    d.pointerUp(90, y);
    expect(s.value).toBe(90);
    expect(events.map((e) => e.phase)).toEqual(["start", "move", "move", "end"]);
    expect(onChange).toHaveBeenLastCalledWith(90);
  });

  it("arrow keys nudge the focused slider; Enter/Space are not consumed by a slider", () => {
    const s = slider({ min: 0, max: 10, value: 4, step: 2, layout: { width: 100 } });
    const root = panel({}, [s]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    d.focus(s);
    expect(d.key({ key: "ArrowRight" }).consumed).toBe(true);
    expect(s.value).toBe(6);
    expect(d.key({ key: "ArrowDown" }).consumed).toBe(true);
    expect(s.value).toBe(4);
    // A slider has no activate action.
    expect(d.key({ key: "Enter" }).consumed).toBe(false);
  });

  it("a focused slider participates in Tab traversal", () => {
    const s = slider({ min: 0, max: 1, value: 0, layout: { width: 50 } });
    const b = button("B");
    const root = panel({}, [s, b]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);
    d.key({ key: "Tab" });
    expect(d.focused()).toBe(s);
    d.key({ key: "Tab" });
    expect(d.focused()).toBe(b);
  });
});

describe("checkbox input — click + keyboard toggle", () => {
  it("a click toggles checked and fires onChange", () => {
    const onChange = vi.fn();
    const c = checkbox({ checked: false, onChange });
    const root = panel({}, [c]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);
    const [x, y] = center(c);

    d.pointerDown(x, y);
    expect(c.state).toBe("active");
    d.pointerUp(x, y);
    expect(c.checked).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("Enter and Space toggle the focused checkbox", () => {
    const onChange = vi.fn();
    const c = checkbox({ checked: false, onChange });
    const root = panel({}, [c]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    d.focus(c);
    expect(d.key({ key: "Enter" }).consumed).toBe(true);
    expect(c.checked).toBe(true);
    expect(d.key({ key: " " }).consumed).toBe(true);
    expect(c.checked).toBe(false);
  });

  it("a disabled checkbox does not toggle on click", () => {
    const onChange = vi.fn();
    const c = checkbox({ checked: false, onChange, state: "disabled" });
    const root = panel({}, [c]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);
    const [x, y] = center(c);
    d.pointerDown(x, y);
    d.pointerUp(x, y);
    expect(c.checked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});
