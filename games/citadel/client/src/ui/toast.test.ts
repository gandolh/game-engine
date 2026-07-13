/**
 * Tests for the in-canvas event-toast stack (toast.ts). Exercises the @engine/ui widget-tree
 * lifecycle (push builds a tone-coloured panel; the stack caps + evicts; tick ramps opacity
 * and drops faded toasts), the aria-live announcement, and the pure helpers (toneOf via the
 * label colour, toastOpacity, newEventsSince). No real surface — we assert the retained tree.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { CITADEL_PAL as EDG } from "../render/citadel-palette";
import type { ContainerNode, LabelNode } from "@engine/ui";
import { ToastManager, newEventsSince, toastOpacity } from "./toast";

const HOLD = 4200;
const FADE = 450;

function panels(t: ToastManager): ContainerNode[] {
  return t.root.children as ContainerNode[];
}
function labelOf(p: ContainerNode): LabelNode {
  return p.children[0] as LabelNode;
}

describe("ToastManager — in-canvas stack", () => {
  let live: HTMLElement;
  beforeEach(() => {
    live = document.createElement("div");
  });

  it("push adds a tone-coloured panel + announces it on the aria-live region", () => {
    const t = new ToastManager(live);
    t.push("A fire broke out!", 0);
    expect(panels(t).length).toBe(1);
    expect(labelOf(panels(t)[0]!).text).toBe("A fire broke out!");
    expect(labelOf(panels(t)[0]!).color).toBe(EDG.salmon); // danger tone
    expect(live.textContent).toBe("A fire broke out!");     // a11y announce
  });

  it("colours by tone (danger/warn/good/info)", () => {
    const t = new ToastManager(live);
    t.push("raid incoming", 0);
    t.push("food shortage", 0);
    t.push("risen to Town", 0);
    t.push("a caravan", 0);
    const colors = panels(t).map((p) => labelOf(p).color);
    expect(colors).toEqual([EDG.salmon, EDG.yellow, EDG.green, EDG.cyan]);
  });

  it("ignores empty / whitespace events", () => {
    const t = new ToastManager(live);
    t.push("   ", 0);
    expect(panels(t).length).toBe(0);
  });

  it("caps the stack at 4, evicting the oldest", () => {
    const t = new ToastManager(live);
    for (let i = 0; i < 6; i++) t.push(`event ${i}`, 0);
    expect(panels(t).length).toBe(4);
    // Oldest two (0,1) evicted → first remaining is "event 2".
    expect(labelOf(panels(t)[0]!).text).toBe("event 2");
  });

  it("tick ramps opacity in, holds, then fades, then removes", () => {
    const t = new ToastManager(live);
    t.push("hello", 0);
    const p = panels(t)[0]!;
    t.tick(80);           // mid fade-in (160ms ramp)
    expect(p.opacity).toBeCloseTo(0.5);
    t.tick(1000);         // holding
    expect(p.opacity).toBe(1);
    t.tick(HOLD + FADE / 2); // mid fade-out
    expect(p.opacity).toBeCloseTo(0.5);
    t.tick(HOLD + FADE + 1); // fully faded → removed
    expect(panels(t).length).toBe(0);
  });
});

describe("toastOpacity — age ramp", () => {
  it("ramps 0→1 over the fade-in, holds at 1, ramps back to 0", () => {
    expect(toastOpacity(0)).toBe(0);
    expect(toastOpacity(160)).toBe(1);     // fully in at the ramp end
    expect(toastOpacity(2000)).toBe(1);    // holding
    expect(toastOpacity(HOLD)).toBe(1);    // hold boundary
    expect(toastOpacity(HOLD + FADE)).toBeCloseTo(0); // faded out
  });
});

describe("newEventsSince — diff the rolling window (sequence-based, brief 97/20)", () => {
  it("returns nothing on the first frame (prevSeq null) — no backlog flood", () => {
    expect(newEventsSince(null, 3, ["a", "b", "c"])).toEqual([]);
  });
  it("returns only events after the last-seen sequence", () => {
    // Seen 2 of the 4 events ever pushed ("a","b"); window now holds all 4.
    expect(newEventsSince(2, 4, ["a", "b", "c", "d"])).toEqual(["c", "d"]);
  });
  it("when far more events were pushed than fit in the window, returns the recent suffix (capped)", () => {
    // 50 events pushed total, window capped to the last 6 — cap at MAX_TOASTS (4).
    expect(newEventsSince(0, 50, ["a", "b", "c", "d", "e", "f"])).toEqual(["c", "d", "e", "f"]);
  });
  it("two identical event strings in the window both count as new", () => {
    // Seen 1 event ("a"); two more identical "dup" events were pushed since.
    // Not a regression guard on its own — a string-matching diff anchored on the unique
    // "a" also splits here correctly. The case below is the one that discriminates.
    expect(newEventsSince(1, 3, ["a", "dup", "dup"])).toEqual(["dup", "dup"]);
  });
  it("regression: a duplicate of the LAST-SHOWN event must still be emitted", () => {
    // Seen 2 of 3 events ever pushed — the last one shown was itself "dup" (the FIRST
    // "dup" in this window, at seq 2). One more "dup" was pushed since (seq 3).
    // A string-matching diff anchored on prevLast="dup" finds the RIGHTMOST "dup" in
    // the window (the new one) and splits there, reporting nothing new — silently
    // swallowing the real event. Sequence-based diffing must still report it.
    expect(newEventsSince(2, 3, ["a", "dup", "dup"])).toEqual(["dup"]);
  });
  it("no new events (seq unchanged) returns nothing", () => {
    expect(newEventsSince(4, 4, ["a", "b", "c", "d"])).toEqual([]);
  });
});
