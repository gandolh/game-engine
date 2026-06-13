import { describe, it, expect } from "vitest";
import { RainField } from "./rain-field";
import { EDG } from "./palette";

const VIEW = { left: 0, right: 640, top: 0, bottom: 360 };
const cfg = (kind: "rain" | "snow" | "none", intensity = 1) =>
  ({ kind, intensity, color: EDG.skyBlue, alpha: 0.5 }) as const;

describe("RainField", () => {
  it("is empty when no weather", () => {
    const f = new RainField();
    f.setConfig(cfg("none"));
    f.update(0.016, VIEW);
    expect(f.count).toBe(0);
  });

  it("fills to a steady, non-zero density for rain", () => {
    const f = new RainField();
    f.setConfig(cfg("rain"));
    f.update(0.016, VIEW);
    expect(f.count).toBeGreaterThan(50);
  });

  it("storm is denser than rainy (intensity scales the pool)", () => {
    const rainy = new RainField(); rainy.setConfig(cfg("rain", 0.8)); rainy.update(0.016, VIEW);
    const storm = new RainField(); storm.setConfig(cfg("rain", 1.3)); storm.update(0.016, VIEW);
    expect(storm.count).toBeGreaterThan(rainy.count);
  });

  it("keeps density stable as the camera pans (no reset on walk)", () => {
    const f = new RainField();
    f.setConfig(cfg("rain"));
    f.update(0.016, VIEW);
    const baseline = f.count;

    let view = { ...VIEW };
    for (let i = 0; i < 120; i++) {
      view = { left: view.left + 8, right: view.right + 8, top: view.top + 4, bottom: view.bottom + 4 };
      f.update(0.016, view);
    }

    expect(f.count).toBe(baseline);
  });

  it("drops land and fire impacts for rain", () => {
    const f = new RainField();
    f.setConfig(cfg("rain"));
    let impacts = 0;

    for (let i = 0; i < 200; i++) f.update(0.05, VIEW, () => { impacts++; });
    expect(impacts).toBeGreaterThan(0);
  });

  it("snow does not fire impacts (no splashes)", () => {
    const f = new RainField();
    f.setConfig(cfg("snow"));
    let impacts = 0;
    for (let i = 0; i < 200; i++) f.update(0.05, VIEW, () => { impacts++; });
    expect(impacts).toBe(0);
  });

  it("clears the pool when weather turns off", () => {
    const f = new RainField();
    f.setConfig(cfg("rain"));
    f.update(0.016, VIEW);
    expect(f.count).toBeGreaterThan(0);
    f.setConfig(cfg("none"));
    f.update(0.016, VIEW);
    expect(f.count).toBe(0);
  });
});
