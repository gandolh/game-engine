import { describe, it, expect } from "vitest";
import type { ButtonNode, UINode } from "@engine/ui";
import { createPlaybackControls, type PlaybackActions, type PlaybackState } from "./playback-controls";

function walk(node: UINode, out: UINode[] = []): UINode[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
function buttons(root: UINode): ButtonNode[] {
  return walk(root).filter((n): n is ButtonNode => n.kind === "button");
}
function buttonByLabel(root: UINode, label: string): ButtonNode | undefined {
  return buttons(root).find((b) => b.label === label);
}
function noopActions(overrides: Partial<PlaybackActions> = {}): PlaybackActions {
  return {
    togglePause: () => {},
    setSpeed: () => {},
    step: () => {},
    skipToHighlight: () => {},
    ...overrides,
  };
}
function state(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return { paused: false, speed: 1, ...overrides };
}

describe("createPlaybackControls — buttons & commands", () => {
  it("wires Pause/Step/Skip/Speed buttons to the actions", () => {
    const calls: string[] = [];
    const speeds: number[] = [];
    const pc = createPlaybackControls(
      noopActions({
        togglePause: () => calls.push("pause"),
        step: () => calls.push("step"),
        skipToHighlight: () => calls.push("skip"),
        setSpeed: (n) => speeds.push(n),
      }),
    );
    buttonByLabel(pc.root, "Pause")?.onActivate?.();
    buttonByLabel(pc.root, "Step")?.onActivate?.();
    buttonByLabel(pc.root, "Skip")?.onActivate?.();
    buttonByLabel(pc.root, "1x")?.onActivate?.();
    buttonByLabel(pc.root, "2x")?.onActivate?.();
    buttonByLabel(pc.root, "4x")?.onActivate?.();
    expect(calls).toEqual(["pause", "step", "skip"]);
    expect(speeds).toEqual([1, 2, 4]);
  });

  it("flips the pause button label between Pause and Resume", () => {
    const pc = createPlaybackControls(noopActions());
    pc.refresh(state({ paused: false }));
    expect(buttons(pc.root).some((b) => b.label === "Pause")).toBe(true);
    pc.refresh(state({ paused: true }));
    expect(buttons(pc.root).some((b) => b.label === "Resume")).toBe(true);
  });

  it("disables Step while running and enables it while paused", () => {
    const pc = createPlaybackControls(noopActions());
    pc.refresh(state({ paused: false }));
    expect(buttonByLabel(pc.root, "Step")?.state).toBe("disabled");
    pc.refresh(state({ paused: true }));
    expect(buttonByLabel(pc.root, "Step")?.state).toBe("normal");
  });

  it("highlights the active speed button and rests the others", () => {
    const pc = createPlaybackControls(noopActions());
    pc.refresh(state({ speed: 2 }));
    expect(buttonByLabel(pc.root, "2x")?.state).toBe("active");
    expect(buttonByLabel(pc.root, "1x")?.state).toBe("normal");
    expect(buttonByLabel(pc.root, "4x")?.state).toBe("normal");
  });

  it("reports content-changed on the pause label flip, not on speed highlight alone", () => {
    const pc = createPlaybackControls(noopActions());
    expect(pc.refresh(state())).toBe(true); // first refresh
    expect(pc.refresh(state())).toBe(false);
    expect(pc.refresh(state({ paused: true }))).toBe(true);
    expect(pc.refresh(state({ paused: true, speed: 2 }))).toBe(false);
  });
});

describe("createPlaybackControls — help modal", () => {
  it("starts closed (getHelpRoot returns null)", () => {
    const pc = createPlaybackControls(noopActions());
    expect(pc.isHelpOpen()).toBe(false);
    expect(pc.getHelpRoot()).toBeNull();
  });

  it("the ? button toggles the help modal open", () => {
    const pc = createPlaybackControls(noopActions());
    buttonByLabel(pc.root, "?")?.onActivate?.();
    expect(pc.isHelpOpen()).toBe(true);
    expect(pc.getHelpRoot()).not.toBeNull();
  });

  it("openHelp/closeHelp/toggleHelp drive the same open flag", () => {
    const pc = createPlaybackControls(noopActions());
    pc.openHelp();
    expect(pc.isHelpOpen()).toBe(true);
    pc.closeHelp();
    expect(pc.isHelpOpen()).toBe(false);
    pc.toggleHelp();
    expect(pc.isHelpOpen()).toBe(true);
  });

  it("the modal's Close button closes it", () => {
    const pc = createPlaybackControls(noopActions());
    pc.openHelp();
    const helpRoot = pc.getHelpRoot();
    expect(helpRoot).not.toBeNull();
    buttonByLabel(helpRoot!, "Close")?.onActivate?.();
    expect(pc.isHelpOpen()).toBe(false);
    expect(pc.getHelpRoot()).toBeNull();
  });
});
