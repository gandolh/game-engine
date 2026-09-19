import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeLayout } from "../layout/layout";
import { DEFAULT_THEME } from "../theme/theme";
import { button, checkbox, panel, resetNodeIds } from "../widget/node";
import type { UINode } from "../widget/node";
import { createInputDispatcher } from "./dispatcher";
import type { DragEvent } from "./dispatcher";

beforeEach(() => resetNodeIds());
function center(n: UINode): [number, number] {
  return [n.rect.x + n.rect.width / 2, n.rect.y + n.rect.height / 2];
}

/**
 * `cancelPointer` exists because every host listens for pointer events on the
 * CANVAS, so a press released outside it never produces a `pointerUp` — and
 * `pointerUp` was the only thing that cleared `active`. The button then rendered
 * as pressed for the rest of the session.
 */
describe("cancelPointer — a gesture that ends off-canvas", () => {
  it("clears a press that would otherwise stay active forever", () => {
    const btn = button("Atacă");
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);
    const [x, y] = center(btn);

    d.pointerMove(x, y);
    d.pointerDown(x, y);
    expect(btn.state).toBe("active");

    // Before this API existed, neither of these helped — the regression this guards.
    d.pointerMove(9999, 9999);
    d.blur();
    expect(btn.state).toBe("active");

    d.cancelPointer();
    expect(btn.state).toBe("normal");
  });

  it("does NOT activate the button — a cancel is not a click", () => {
    const onActivate = vi.fn();
    const btn = button("Atacă", { onActivate });
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    d.pointerDown(...center(btn));
    d.cancelPointer();
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("does NOT toggle a checkbox", () => {
    const cb = checkbox({ label: "Sound", checked: false });
    const root = panel({}, [cb]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    d.pointerDown(...center(cb));
    d.cancelPointer();
    expect(cb.checked).toBe(false);
  });

  it("leaves the node at rest, not hover — the pointer is not over it", () => {
    const btn = button("Go");
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);
    const [x, y] = center(btn);

    d.pointerMove(x, y); // hovered...
    d.pointerDown(x, y); // ...then pressed
    d.cancelPointer();
    expect(btn.state).toBe("normal");
  });

  it("ends an in-flight drag with cancelled:true so a host can tell it apart", () => {
    const events: DragEvent[] = [];
    const btn = button("Slide");
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root, { onDrag: (e) => events.push({ ...e }) });
    const [x, y] = center(btn);

    d.pointerDown(x, y);
    d.pointerMove(x + 50, y + 50);
    expect(events.map((e) => e.phase)).toEqual(["start", "move"]);

    d.cancelPointer();
    const last = events.at(-1)!;
    expect(last.phase).toBe("end");
    expect(last.cancelled).toBe(true);
  });

  it("a COMPLETED drag still reports cancelled as falsy", () => {
    const events: DragEvent[] = [];
    const btn = button("Slide");
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root, { onDrag: (e) => events.push({ ...e }) });
    const [x, y] = center(btn);

    d.pointerDown(x, y);
    d.pointerMove(x + 50, y + 50);
    d.pointerUp(x + 50, y + 50);
    expect(events.at(-1)!.phase).toBe("end");
    expect(events.at(-1)!.cancelled).toBeFalsy();
  });

  it("is idempotent and safe with no press in flight", () => {
    const btn = button("Go");
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);

    expect(() => {
      d.cancelPointer();
      d.cancelPointer();
    }).not.toThrow();
    expect(btn.state).toBe("normal");
  });

  it("a later press still works normally after a cancel", () => {
    const onActivate = vi.fn();
    const btn = button("Go", { onActivate });
    const root = panel({}, [btn]);
    computeLayout(root, 0, 0, DEFAULT_THEME);
    const d = createInputDispatcher(() => root);
    const [x, y] = center(btn);

    d.pointerDown(x, y);
    d.cancelPointer();

    d.pointerDown(x, y);
    d.pointerUp(x, y);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
