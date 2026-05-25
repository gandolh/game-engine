import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfigPanel } from "./config-panel";
import type { ConfigSchema } from "./config-panel";

const schema: ConfigSchema = [
  { key: "speed", label: "Speed", type: "number", min: 0, max: 10, step: 0.5, default: 5 },
  { key: "debug", label: "Debug Mode", type: "boolean", default: false },
  { key: "season", label: "Season", type: "enum", options: ["spring", "summer", "autumn", "winter"], default: "spring" },
];

describe("ConfigPanel", () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement("div");
    document.body.appendChild(parent);
  });

  it("renders one row per schema field", () => {
    const onChange = vi.fn();
    const panel = new ConfigPanel(parent, schema, onChange);

    // One label per field
    const labels = parent.querySelectorAll("label");
    expect(labels.length).toBe(schema.length);
    panel.destroy();
  });

  it("renders labels with correct text", () => {
    const onChange = vi.fn();
    const panel = new ConfigPanel(parent, schema, onChange);

    const text = parent.textContent ?? "";
    expect(text).toContain("Speed");
    expect(text).toContain("Debug Mode");
    expect(text).toContain("Season");
    panel.destroy();
  });

  it("fires onChange with parsed number when number input changes", () => {
    const onChange = vi.fn();
    const panel = new ConfigPanel(parent, schema, onChange);

    const input = parent.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    input.value = "7.5";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith("speed", 7.5);
    panel.destroy();
  });

  it("fires onChange with boolean when checkbox changes", () => {
    const onChange = vi.fn();
    const panel = new ConfigPanel(parent, schema, onChange);

    const checkbox = parent.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith("debug", true);
    panel.destroy();
  });

  it("fires onChange with string when enum select changes", () => {
    const onChange = vi.fn();
    const panel = new ConfigPanel(parent, schema, onChange);

    const select = parent.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();

    select.value = "summer";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith("season", "summer");
    panel.destroy();
  });

  it("Reset to defaults fires onChange for every key with default values", () => {
    const onChange = vi.fn();
    const panel = new ConfigPanel(parent, schema, onChange);

    // Change values first
    const numInput = parent.querySelector('input[type="number"]') as HTMLInputElement;
    numInput.value = "9";
    numInput.dispatchEvent(new Event("input"));
    onChange.mockClear();

    // Click reset
    const resetBtn = Array.from(parent.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Reset"),
    );
    expect(resetBtn).toBeTruthy();
    resetBtn?.click();

    expect(onChange).toHaveBeenCalledTimes(schema.length);
    expect(onChange).toHaveBeenCalledWith("speed", 5);
    expect(onChange).toHaveBeenCalledWith("debug", false);
    expect(onChange).toHaveBeenCalledWith("season", "spring");
    panel.destroy();
  });

  it("destroy removes the panel from DOM", () => {
    const onChange = vi.fn();
    const panel = new ConfigPanel(parent, schema, onChange);
    panel.destroy();
    expect(parent.children.length).toBe(0);
  });

  it("setVisible hides and shows the panel", () => {
    const onChange = vi.fn();
    const panel = new ConfigPanel(parent, schema, onChange);
    panel.setVisible(false);
    const panelEl = parent.children[0] as HTMLElement;
    expect(panelEl.style.display).toBe("none");
    panel.setVisible(true);
    expect(panelEl.style.display).toBe("");
    panel.destroy();
  });
});
