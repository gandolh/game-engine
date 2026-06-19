/**
 * Tests for the Citadel settings modal (brief 25). jsdom env (configured for
 * citadel). Covers the pure helpers and the DOM-driven checkbox binding.
 */
import { describe, it, expect, beforeEach } from "vitest";
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

describe("SettingsModal (jsdom)", () => {
  let washOn: boolean;
  let zoom: number;
  let cfg: SettingsModalConfig;

  beforeEach(() => {
    document.body.innerHTML = "";
    washOn = true;
    zoom = 1;
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
      ],
      setSpeed: () => {},
      getZoom: () => zoom,
      setZoom: (z) => {
        zoom = z;
      },
      minZoom: 0.5,
      maxZoom: 6,
    };
  });

  it("toggling a checkbox flips the bound boolean", () => {
    const modal = new SettingsModal(cfg);
    modal.show();
    const checkbox = document.getElementById("settings-toggle-wash") as HTMLInputElement;
    expect(checkbox.checked).toBe(true); // reflects initial state
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    expect(washOn).toBe(false);
  });

  it("reflects current state when re-opened", () => {
    const modal = new SettingsModal(cfg);
    washOn = false;
    modal.show();
    const checkbox = document.getElementById("settings-toggle-wash") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("renders semantic tablist with one selected tab (roving tabindex)", () => {
    new SettingsModal(cfg);
    const tabs = Array.from(document.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    expect(tabs.length).toBeGreaterThan(1);
    const selected = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected.length).toBe(1);
    expect(selected[0]!.tabIndex).toBe(0);
    expect(tabs.filter((t) => t.tabIndex === -1).length).toBe(tabs.length - 1);
  });

  it("hides rows that do not match the search query", () => {
    const modal = new SettingsModal(cfg);
    modal.show();
    const search = document.querySelector(".settings-search") as HTMLInputElement;
    search.value = "wash";
    search.dispatchEvent(new Event("input"));
    const washRow = document
      .getElementById("settings-toggle-wash")!
      .closest(".settings-row") as HTMLDivElement;
    expect(washRow.hidden).toBe(false);
    // A non-matching row (the zoom row) should be hidden.
    const zoomRow = document.querySelector(".settings-zoom")!.closest(".settings-row") as HTMLDivElement;
    expect(zoomRow.hidden).toBe(true);
  });

  it("Escape closes the modal", () => {
    const modal = new SettingsModal(cfg);
    modal.show();
    expect(modal.isOpen()).toBe(true);
    const root = document.getElementById("settings-modal")!;
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(modal.isOpen()).toBe(false);
  });
});
