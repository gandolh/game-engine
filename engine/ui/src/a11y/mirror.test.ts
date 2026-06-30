import { beforeEach, describe, expect, it, vi } from "vitest";
import { box, button, checkbox, label, panel, slider, resetNodeIds } from "../widget/node";
import type { UINode } from "../widget/node";
import { createA11yMirror } from "./mirror";

beforeEach(() => resetNodeIds());

/** Mount element, in the jsdom document so focus/AT semantics behave. */
function mount(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

/** The mirror's root landmark (first child of the mount). */
function root(host: HTMLElement): HTMLElement {
  return host.firstElementChild as HTMLElement;
}

/** All mirror buttons under the host, in DOM (tab) order. */
function buttons(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll("button"));
}

describe("a11y mirror — tree → DOM", () => {
  it("creates a <button> per button with its label as accessible name and disabled reflected", () => {
    const tree: UINode = panel({}, [
      label("Title"),
      button("Plant"),
      button("Harvest", { state: "disabled" }),
    ]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);

    const btns = buttons(host);
    expect(btns.map((b) => b.textContent)).toEqual(["Plant", "Harvest"]);
    expect(btns[0]!.disabled).toBe(false);
    expect(btns[1]!.disabled).toBe(true);
    mirror.destroy();
  });

  it("hoists a panel's leading label into the region's aria-label (not a separate paragraph)", () => {
    const tree: UINode = panel({}, [label("Inventory"), button("Use")]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);

    const region = host.querySelector('[role="region"][aria-label="Inventory"]');
    expect(region).not.toBeNull();
    // The heading label is consumed, so no <p> for it.
    expect(host.querySelectorAll("p").length).toBe(0);
    mirror.destroy();
  });

  it("maps a non-leading label to a <p> and a bare box to a role=group", () => {
    const tree: UINode = box({}, [button("A"), label("note")]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);

    expect(host.querySelector('[role="group"]')).not.toBeNull();
    expect(host.querySelector("p")!.textContent).toBe("note");
    mirror.destroy();
  });

  it("keeps DOM (tab) order == pre-order tree order", () => {
    const tree: UINode = box({}, [
      button("first"),
      box({}, [button("nested")]),
      button("last"),
    ]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);
    expect(buttons(host).map((b) => b.textContent)).toEqual(["first", "nested", "last"]);
    mirror.destroy();
  });
});

describe("a11y mirror — same command path", () => {
  it("clicking a mirror button fires that node's onActivate", () => {
    const onActivate = vi.fn();
    const tree: UINode = panel({}, [button("Go", { onActivate })]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);

    buttons(host)[0]!.click();
    expect(onActivate).toHaveBeenCalledTimes(1);
    mirror.destroy();
  });

  it("a disabled mirror button is not operable", () => {
    const onActivate = vi.fn();
    const tree: UINode = panel({}, [button("Go", { onActivate, state: "disabled" })]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);

    const btn = buttons(host)[0]!;
    expect(btn.disabled).toBe(true);
    btn.click(); // native: no-op while disabled
    expect(onActivate).not.toHaveBeenCalled();
    mirror.destroy();
  });

  it("reflects aria-pressed only while active", () => {
    const btn = button("Hold");
    const tree: UINode = panel({}, [btn]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);
    expect(buttons(host)[0]!.getAttribute("aria-pressed")).toBeNull();

    btn.state = "active";
    mirror.update(tree);
    expect(buttons(host)[0]!.getAttribute("aria-pressed")).toBe("true");

    btn.state = "normal";
    mirror.update(tree);
    expect(buttons(host)[0]!.getAttribute("aria-pressed")).toBeNull();
    mirror.destroy();
  });
});

describe("a11y mirror — reconciliation", () => {
  it("relabels in place without recreating the element", () => {
    const btn = button("Old");
    const tree: UINode = panel({}, [btn]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);
    const el = buttons(host)[0]!;

    btn.label = "New";
    mirror.update(tree);
    expect(buttons(host)[0]).toBe(el); // same DOM node
    expect(el.textContent).toBe("New");
    mirror.destroy();
  });

  it("adds and removes buttons on tree change", () => {
    const a = button("A");
    const tree = panel({}, [a]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);
    expect(buttons(host).length).toBe(1);

    const b = button("B");
    tree.children = [a, b];
    mirror.update(tree);
    expect(buttons(host).map((x) => x.textContent)).toEqual(["A", "B"]);

    tree.children = [b]; // drop A
    mirror.update(tree);
    expect(buttons(host).map((x) => x.textContent)).toEqual(["B"]);
    mirror.destroy();
  });

  it("reorders elements to match the new tree order (moves, not duplicates)", () => {
    const a = button("A");
    const b = button("B");
    const tree = box({}, [a, b]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);

    tree.children = [b, a];
    mirror.update(tree);
    expect(buttons(host).map((x) => x.textContent)).toEqual(["B", "A"]);
    expect(buttons(host).length).toBe(2); // no duplicates
    mirror.destroy();
  });

  it("clears the mirror when updated with null", () => {
    const tree = panel({}, [button("X")]);
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(tree);
    expect(buttons(host).length).toBe(1);
    mirror.update(null);
    expect(buttons(host).length).toBe(0);
    mirror.destroy();
  });
});

describe("a11y mirror — focus bridge", () => {
  it("reports the node id out when a mirror button takes DOM focus", () => {
    const btn = button("Go");
    const tree = panel({}, [btn]);
    const host = mount();
    const seen: (number | null)[] = [];
    const mirror = createA11yMirror(host, { onFocusNode: (id) => seen.push(id) });
    mirror.update(tree);

    buttons(host)[0]!.focus();
    expect(seen).toContain(btn.id);
    mirror.destroy();
  });

  it("setFocus(id) moves DOM focus and does not re-report via onFocusNode", () => {
    const btn = button("Go");
    const tree = panel({}, [btn]);
    const host = mount();
    const onFocusNode = vi.fn();
    const mirror = createA11yMirror(host, { onFocusNode });
    mirror.update(tree);

    mirror.setFocus(btn.id);
    expect(document.activeElement).toBe(buttons(host)[0]);
    expect(onFocusNode).not.toHaveBeenCalled(); // suppressed: framework-originated
    mirror.destroy();
  });

  it("reports null when focus leaves the mirror entirely", () => {
    const btn = button("Go");
    const tree = panel({}, [btn]);
    const host = mount();
    const seen: (number | null)[] = [];
    const mirror = createA11yMirror(host, { onFocusNode: (id) => seen.push(id) });
    mirror.update(tree);

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    buttons(host)[0]!.focus();
    outside.focus();
    expect(seen[seen.length - 1]).toBeNull();
    mirror.destroy();
    outside.remove();
  });
});

describe("a11y mirror — slider", () => {
  it("mirrors a slider as <input type=range> with min/max/value/step", () => {
    const s = slider({ min: 0, max: 10, value: 4, step: 2 });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [s]));

    const input = host.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.min).toBe("0");
    expect(input.max).toBe("10");
    expect(input.step).toBe("2");
    expect(input.value).toBe("4");
    expect(input.getAttribute("aria-valuenow")).toBe("4");
    mirror.destroy();
  });

  it("a native range 'input' event drives the node's value + onChange (same path)", () => {
    const onChange = vi.fn();
    const s = slider({ min: 0, max: 100, value: 0, onChange, step: 1 });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [s]));

    const input = host.querySelector('input[type="range"]') as HTMLInputElement;
    input.value = "30";
    input.dispatchEvent(new Event("input"));
    expect(s.value).toBe(30);
    expect(onChange).toHaveBeenLastCalledWith(30);
    mirror.destroy();
  });

  it("framework→DOM: updating node.value writes the input value without re-emitting", () => {
    const onChange = vi.fn();
    const s = slider({ min: 0, max: 100, value: 0, onChange, step: 1 });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [s]));

    s.value = 70;
    mirror.update(panel({}, [s]));
    const input = host.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input.value).toBe("70");
    expect(onChange).not.toHaveBeenCalled(); // patch must not feed back
    mirror.destroy();
  });

  it("continuous slider uses step='any'", () => {
    const s = slider({ min: 0, max: 1, value: 0.5 });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [s]));
    const input = host.querySelector('input[type="range"]') as HTMLInputElement;
    expect(input.step).toBe("any");
    mirror.destroy();
  });

  it("out-of-step input value is snapped before writing node.value and firing onChange", () => {
    // Slider: min=0, max=1, step=0.1. A native input value of "0.15" should snap to 0.1 or 0.2.
    const onChange = vi.fn();
    const s = slider({ min: 0, max: 1, value: 0, step: 0.1, onChange });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [s]));

    const input = host.querySelector('input[type="range"]') as HTMLInputElement;
    input.value = "0.15";
    input.dispatchEvent(new Event("input"));

    // 0.15 snaps to 0.1 or 0.2 (nearest step); either is acceptable, but NOT 0.15.
    expect(s.value).not.toBeCloseTo(0.15, 5);
    expect(s.value === 0.1 || s.value === 0.2).toBe(true);
    // onChange must receive the snapped node.value, not the raw 0.15.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toBe(s.value);
    mirror.destroy();
  });
});

describe("a11y mirror — checkbox", () => {
  it("mirrors a checkbox as <input type=checkbox> with its label as the accessible name", () => {
    const c = checkbox({ checked: true, label: "Mute" });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [c]));

    const input = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.checked).toBe(true);
    // The caption lives in the wrapping <label>, making it the accessible name.
    const lbl = input.closest("label")!;
    expect(lbl.textContent).toContain("Mute");
    mirror.destroy();
  });

  it("a native 'change' drives the node's checked + onChange", () => {
    const onChange = vi.fn();
    const c = checkbox({ checked: false, onChange });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [c]));

    const input = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change"));
    expect(c.checked).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(true);
    mirror.destroy();
  });

  it("framework→DOM: updating node.checked reflects onto the input without re-emitting", () => {
    const onChange = vi.fn();
    const c = checkbox({ checked: false, onChange });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [c]));

    c.checked = true;
    mirror.update(panel({}, [c]));
    const input = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.checked).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    mirror.destroy();
  });

  it("a disabled checkbox reflects disabled and is inoperable", () => {
    const onChange = vi.fn();
    const c = checkbox({ checked: false, onChange, state: "disabled" });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [c]));
    const input = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    mirror.destroy();
  });

  it("label changes (empty→Foo→Bar) produce exactly one text node with the latest caption", () => {
    const c = checkbox({ checked: false, label: "" });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [c]));

    // Start with empty label — no text node yet.
    const lbl = host.querySelector("label")!;
    const textNodes = (): Text[] =>
      Array.from(lbl.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE) as Text[];
    expect(textNodes().length).toBe(0);

    // Set caption to "Foo".
    c.label = "Foo";
    mirror.update(panel({}, [c]));
    expect(textNodes().length).toBe(1);
    expect(textNodes()[0]!.textContent).toBe("Foo");

    // Change caption to "Bar" — still exactly one text node.
    c.label = "Bar";
    mirror.update(panel({}, [c]));
    expect(textNodes().length).toBe(1);
    expect(textNodes()[0]!.textContent).toBe("Bar");

    mirror.destroy();
  });
});

describe("a11y mirror — focus bridge for new kinds", () => {
  it("a slider reports its node id when it takes DOM focus", () => {
    const s = slider({ min: 0, max: 1, value: 0 });
    const host = mount();
    const seen: (number | null)[] = [];
    const mirror = createA11yMirror(host, { onFocusNode: (id) => seen.push(id) });
    mirror.update(panel({}, [s]));

    const input = host.querySelector('input[type="range"]') as HTMLInputElement;
    input.focus();
    expect(seen).toContain(s.id);
    mirror.destroy();
  });

  it("setFocus(id) moves DOM focus to a checkbox's inner input", () => {
    const c = checkbox({ checked: false, label: "X" });
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [c]));

    mirror.setFocus(c.id);
    const input = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    mirror.destroy();
  });
});

describe("a11y mirror — visually hidden but AT-visible", () => {
  it("applies sr-only clipping, never display:none or visibility:hidden", () => {
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [button("X")]));
    const r = root(host);

    expect(r.style.display).not.toBe("none");
    expect(r.style.visibility).not.toBe("hidden");
    expect(r.style.position).toBe("absolute");
    expect(r.style.width).toBe("1px");
    expect(r.style.height).toBe("1px");
    expect(r.style.overflow).toBe("hidden");
    mirror.destroy();
  });

  it("destroy() removes the mirror root but leaves the mount", () => {
    const host = mount();
    const mirror = createA11yMirror(host);
    mirror.update(panel({}, [button("X")]));
    expect(host.firstElementChild).not.toBeNull();
    mirror.destroy();
    expect(host.firstElementChild).toBeNull();
    expect(host.isConnected).toBe(true);
  });
});
