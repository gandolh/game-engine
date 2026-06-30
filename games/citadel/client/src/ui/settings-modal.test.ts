/**
 * Tests for the Citadel settings modal. Covers the pure helpers (matchesSearch,
 * nextTabIndex) and the retained `@engine/ui` node-tree behaviour (headless — the
 * tree is plain objects; no renderer or DOM needed).
 */
import { describe, it, expect, beforeEach } from "vitest";
import type {
  CheckboxNode,
  SliderNode,
  ButtonNode,
  ContainerNode,
  UINode,
} from "@engine/ui";
import {
  matchesSearch,
  nextTabIndex,
  SettingsModal,
  type SettingsModalConfig,
} from "./settings-modal";

describe("matchesSearch", () => {
  it("matches everything on an empty / whitespace query", () => {
    expect(matchesSearch("", "Weather", "rain snow")).toBe(true);
    expect(matchesSearch("   ", "Weather", "rain snow")).toBe(true);
  });

  it("matches a case-insensitive substring of the label", () => {
    expect(matchesSearch("weath", "Weather FX", "")).toBe(true);
    expect(matchesSearch("WEATHER", "Weather FX", "")).toBe(true);
  });

  it("matches a substring of the keyword list", () => {
    expect(matchesSearch("snow", "Weather", "rain snow particles")).toBe(true);
    expect(matchesSearch("particle", "Weather", "rain snow particles")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesSearch("zoom", "Weather", "rain snow")).toBe(false);
  });
});

describe("nextTabIndex", () => {
  it("steps forward and wraps from last to first", () => {
    expect(nextTabIndex(0, "ArrowRight", 3)).toBe(1);
    expect(nextTabIndex(2, "ArrowRight", 3)).toBe(0);
    expect(nextTabIndex(2, "ArrowDown", 3)).toBe(0);
  });

  it("steps back and wraps from first to last", () => {
    expect(nextTabIndex(1, "ArrowLeft", 3)).toBe(0);
    expect(nextTabIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(nextTabIndex(0, "ArrowUp", 3)).toBe(2);
  });

  it("jumps to first / last on Home / End", () => {
    expect(nextTabIndex(1, "Home", 3)).toBe(0);
    expect(nextTabIndex(1, "End", 3)).toBe(2);
  });

  it("returns the current index for an empty tablist", () => {
    expect(nextTabIndex(0, "ArrowRight", 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Node-tree helpers (headless walks over the retained @engine/ui tree)
// ---------------------------------------------------------------------------

function walk(node: UINode, visit: (n: UINode) => void): void {
  visit(node);
  for (const c of node.children) walk(c, visit);
}

function collect<T extends UINode>(root: UINode, kind: UINode["kind"]): T[] {
  const out: T[] = [];
  walk(root, (n) => {
    if (n.kind === kind) out.push(n as T);
  });
  return out;
}

describe("SettingsModal (in-canvas @engine/ui)", () => {
  let washOn: boolean;
  let lightOn: boolean;
  let zoom: number;
  let speed: number;
  let cfg: SettingsModalConfig;

  beforeEach(() => {
    washOn = true;
    lightOn = false;
    zoom = 1;
    speed = 1;
    cfg = {
      toggles: [
        {
          id: "wash",
          label: "Day/night wash",
          keywords: "wash daynight tint",
          get: () => washOn,
          set: (v) => {
            washOn = v;
          },
        },
        {
          id: "light",
          label: "Night light pool",
          keywords: "light glow",
          get: () => lightOn,
          set: (v) => {
            lightOn = v;
          },
        },
      ],
      setSpeed: (n) => {
        speed = n;
      },
      getZoom: () => zoom,
      setZoom: (z) => {
        zoom = z;
      },
      minZoom: 0.5,
      maxZoom: 6,
    };
  });

  it("builds a panel root and exposes the open/close API", () => {
    const modal = new SettingsModal(cfg);
    expect(modal.root.kind).toBe("panel");
    expect(modal.isOpen()).toBe(false);
    modal.show();
    expect(modal.isOpen()).toBe(true);
    modal.close();
    expect(modal.isOpen()).toBe(false);
    modal.toggle();
    expect(modal.isOpen()).toBe(true);
  });

  it("creates one checkbox per toggle (Atmosphere tab)", () => {
    const modal = new SettingsModal(cfg);
    modal.selectTab(1); // atmosphere
    const boxes = collect<CheckboxNode>(modal.root, "checkbox");
    expect(boxes.length).toBe(cfg.toggles.length);
    expect(boxes.map((b) => b.label)).toEqual(["Day/night wash", "Night light pool"]);
  });

  it("toggling a checkbox flips the bound boolean via onChange", () => {
    const modal = new SettingsModal(cfg);
    modal.selectTab(1);
    const boxes = collect<CheckboxNode>(modal.root, "checkbox");
    const washBox = boxes[0]!;
    expect(washBox.checked).toBe(true); // reflects initial state
    washBox.toggle();
    expect(washOn).toBe(false);
    expect(washBox.checked).toBe(false);
  });

  it("show() resyncs checkbox.checked from live toggle state", () => {
    const modal = new SettingsModal(cfg);
    washOn = false;
    lightOn = true;
    modal.show();
    modal.selectTab(1);
    const boxes = collect<CheckboxNode>(modal.root, "checkbox");
    expect(boxes[0]!.checked).toBe(false);
    expect(boxes[1]!.checked).toBe(true);
  });

  it("the zoom slider reflects cfg min/max/value and writes back on change", () => {
    const modal = new SettingsModal(cfg);
    modal.selectTab(0); // display
    const sliders = collect<SliderNode>(modal.root, "slider");
    expect(sliders.length).toBe(1);
    const s = sliders[0]!;
    expect(s.min).toBe(0.5);
    expect(s.max).toBe(6);
    expect(s.value).toBe(1);
    // Simulate the dispatcher writing a value (mirrors a drag/track click).
    s.rect = { x: 0, y: 0, width: 100, height: 12 };
    s.setValueFromPointerX(100); // far right → max
    expect(zoom).toBe(6);
  });

  it("show() resyncs the slider value + value label from live zoom", () => {
    const modal = new SettingsModal(cfg);
    zoom = 3.5;
    modal.show();
    modal.selectTab(0);
    const s = collect<SliderNode>(modal.root, "slider")[0]!;
    expect(s.value).toBe(3.5);
    // The value label (a label coloured EDG.cyan) shows the formatted zoom.
    const labels = collect<UINode>(modal.root, "label");
    const hasValueLabel = labels.some((l) => (l as { text: string }).text === "3.5x");
    expect(hasValueLabel).toBe(true);
  });

  it("Simulation speed buttons call cfg.setSpeed", () => {
    const modal = new SettingsModal(cfg);
    modal.selectTab(2); // simulation
    const buttons = collect<ButtonNode>(modal.root, "button");
    const speedBtns = buttons.filter((b) => /^[124]x$/.test(b.label));
    expect(speedBtns.map((b) => b.label)).toEqual(["1x", "2x", "4x"]);
    speedBtns[1]!.onActivate?.();
    expect(speed).toBe(2);
  });

  it("selecting a tab swaps which content panel is in the rendered tree", () => {
    const modal = new SettingsModal(cfg);

    modal.selectTab(0);
    expect(collect<SliderNode>(modal.root, "slider").length).toBe(1); // display has the slider
    expect(collect<CheckboxNode>(modal.root, "checkbox").length).toBe(0);

    modal.selectTab(1);
    expect(collect<SliderNode>(modal.root, "slider").length).toBe(0);
    expect(collect<CheckboxNode>(modal.root, "checkbox").length).toBe(cfg.toggles.length);

    modal.selectTab(2);
    expect(collect<CheckboxNode>(modal.root, "checkbox").length).toBe(0);
    const speedBtns = collect<ButtonNode>(modal.root, "button").filter((b) => /^[124]x$/.test(b.label));
    expect(speedBtns.length).toBe(3);
  });

  it("marks the selected tab button active and the rest normal", () => {
    const modal = new SettingsModal(cfg);
    const tabBtns = modal.tabButtonNodes() as ButtonNode[];
    expect(tabBtns.length).toBe(3);
    modal.selectTab(1);
    expect(modal.selectedTab()).toBe(1);
    expect(tabBtns.map((b) => b.state)).toEqual(["normal", "active", "normal"]);
  });

  it("the Close button calls close()", () => {
    const modal = new SettingsModal(cfg);
    modal.show();
    const closeBtn = collect<ButtonNode>(modal.root, "button").find((b) => b.label === "Close");
    expect(closeBtn).toBeDefined();
    closeBtn!.onActivate?.();
    expect(modal.isOpen()).toBe(false);
  });
});
