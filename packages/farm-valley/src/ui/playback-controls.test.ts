import { describe, it, expect, beforeEach } from "vitest";
import { PlaybackControlsPanel } from "./playback-controls";

function btnByText(parent: HTMLElement, includes: string): HTMLButtonElement {
  const btns = Array.from(parent.querySelectorAll("button"));
  const found = btns.find((b) => (b.textContent ?? "").includes(includes));
  if (found === undefined) throw new Error(`no button containing "${includes}"`);
  return found as HTMLButtonElement;
}

describe("PlaybackControlsPanel", () => {
  let parent: HTMLElement;
  let panel: PlaybackControlsPanel;

  beforeEach(() => {
    parent = document.createElement("div");
    document.body.appendChild(parent);
    panel = new PlaybackControlsPanel(parent);
  });

  it("clicking pause fires the pause callback with the toggled value", () => {
    const calls: boolean[] = [];
    panel.setOnPause((p) => calls.push(p));

    // Starts unpaused → first click requests paused=true.
    btnByText(parent, "Pause").click();
    expect(calls).toEqual([true]);

    // Reflect the new state; button now reads "Resume" → next click requests false.
    panel.update({ paused: true, speed: 1 });
    btnByText(parent, "Resume").click();
    expect(calls).toEqual([true, false]);
  });

  it("speed buttons fire with the right multiplier", () => {
    const calls: number[] = [];
    panel.setOnSpeed((m) => calls.push(m));

    btnByText(parent, "2×").click();
    btnByText(parent, "4×").click();
    btnByText(parent, "1×").click();

    expect(calls).toEqual([2, 4, 1]);
  });

  it("step button fires the step callback (and is enabled only while paused)", () => {
    let count = 0;
    panel.setOnStep(() => {
      count += 1;
    });

    const step = btnByText(parent, "Step");

    // Disabled while running.
    expect(step.disabled).toBe(true);

    // Enabled once paused.
    panel.update({ paused: true, speed: 1 });
    expect(step.disabled).toBe(false);
    step.click();
    expect(count).toBe(1);
  });

  it("update highlights the active speed button", () => {
    panel.update({ paused: false, speed: 4 });
    const four = btnByText(parent, "4×");
    const one = btnByText(parent, "1×");
    expect(four.style.fontWeight).toBe("700");
    expect(one.style.fontWeight).toBe("400");
  });
});
