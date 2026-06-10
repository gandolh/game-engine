import { describe, it, expect, beforeEach } from "vitest";
import { PlaybackControlsPanel } from "./playback-controls";
import { personalityColor } from "./colors";

const PERSONALITY_KINDS = ["conservative", "aggressive", "hoarder", "opportunist"] as const;
const FSM_STATES = ["WAIT_DAY", "PERCEIVE", "DELIBERATE", "ACT", "FINISH_DAY", "SLEEP"] as const;

/** jsdom normalizes a CSS color to rgb(...); convert an EDG hex the same way. */
function normalizeColor(value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return computed;
}

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

    btnByText(parent, "Pause").click();
    expect(calls).toEqual([true]);

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
    expect(step.disabled).toBe(true);

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

  describe("help modal legends", () => {
    function openModal(): HTMLElement {
      btnByText(parent, "?").click();
      const modal = Array.from(parent.children).find(
        (el) => el instanceof HTMLElement && el.style.display === "flex",
      ) as HTMLElement | undefined;
      if (modal === undefined) throw new Error("help modal not visible after opening");
      return modal;
    }

    it("lists all four personality kinds", () => {
      const modal = openModal();
      const text = modal.textContent ?? "";
      for (const kind of PERSONALITY_KINDS) {
        expect(text).toContain(kind);
      }
    });

    it("gives each personality a swatch in its personalityColor()", () => {
      const modal = openModal();
      const spans = Array.from(modal.querySelectorAll("span"));
      for (const kind of PERSONALITY_KINDS) {
        const expected = normalizeColor(personalityColor(kind));
        const swatch = spans.find(
          (s) =>
            s.textContent === "" &&
            s.style.background !== "" &&
            normalizeColor(s.style.background) === expected,
        );
        expect(swatch, `swatch for ${kind} (${expected})`).toBeDefined();
      }
    });

    it("lists all six FSM states with descriptions", () => {
      const modal = openModal();
      const text = modal.textContent ?? "";
      for (const state of FSM_STATES) {
        expect(text).toContain(state);
      }
      const stateSpans = Array.from(modal.querySelectorAll("span")).filter((s) =>
        (FSM_STATES as readonly string[]).includes(s.textContent ?? ""),
      );
      expect(stateSpans).toHaveLength(FSM_STATES.length);
      for (const span of stateSpans) {
        const row = span.parentElement?.parentElement;
        const desc = row?.lastElementChild as HTMLElement | null;
        expect(desc).not.toBeNull();
        expect((desc?.textContent ?? "").length).toBeGreaterThan(0);
      }
    });
  });
});
