/**
 * Tests for the Citadel new-game mode picker (brief 103). Headless — the retained `@engine/ui`
 * tree is plain objects, so no renderer or DOM is needed; we walk it for the two mode buttons and
 * drive their `onActivate` exactly as the input dispatcher / a11y mirror would.
 *
 * The load-bearing invariants: the picker hands back the string the worker's `init` expects, it
 * opens only when no mode was pre-chosen (the `?mp` / `?challenge` fast-paths skip it), and it
 * fires AT MOST ONCE — a second activation must not re-init a running sim.
 */
import { describe, it, expect, vi } from "vitest";
import type { ButtonNode, UINode } from "@engine/ui";
import { NewGameModal, type GameMode } from "./new-game-modal";

/** Every button in the tree, in tree order (cozy then challenge). */
function buttonsOf(node: UINode): ButtonNode[] {
  const out: ButtonNode[] = [];
  const walk = (n: UINode): void => {
    if (n.kind === "button") out.push(n as ButtonNode);
    const kids = (n as { children?: readonly UINode[] }).children;
    if (kids !== undefined) for (const c of kids) walk(c);
  };
  walk(node);
  return out;
}

function makeModal(openAtStart = true): { modal: NewGameModal; onChoose: (m: GameMode) => void } {
  const onChoose = vi.fn();
  const modal = new NewGameModal({ onChoose }, { openAtStart });
  return { modal, onChoose };
}

describe("NewGameModal", () => {
  it("offers exactly two rulesets: cozy and challenge", () => {
    const { modal } = makeModal();
    const labels = buttonsOf(modal.root).map((b) => b.label);
    expect(labels).toEqual(["Cozy", "Challenge"]);
  });

  it("is open at start when no mode was pre-chosen, and closed when one was", () => {
    expect(makeModal(true).modal.isOpen()).toBe(true);
    expect(makeModal(false).modal.isOpen()).toBe(false);
  });

  it("hands the host the chosen mode and closes (cozy)", () => {
    const { modal, onChoose } = makeModal();
    buttonsOf(modal.root)[0]!.onActivate?.();
    expect(onChoose).toHaveBeenCalledWith("cozy");
    expect(modal.isOpen()).toBe(false);
  });

  it("hands the host the chosen mode and closes (challenge)", () => {
    const { modal, onChoose } = makeModal();
    buttonsOf(modal.root)[1]!.onActivate?.();
    expect(onChoose).toHaveBeenCalledWith("challenge");
    expect(modal.isOpen()).toBe(false);
  });

  it("fires at most once — a second activation cannot re-init the sim", () => {
    const { modal, onChoose } = makeModal();
    const [cozy, challenge] = buttonsOf(modal.root);
    cozy!.onActivate?.();
    challenge!.onActivate?.(); // e.g. a queued key event landing after the close
    cozy!.onActivate?.();
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith("cozy");
  });

  it("never fires when it was skipped by a URL / MP fast-path", () => {
    const { modal, onChoose } = makeModal(false);
    buttonsOf(modal.root)[1]!.onActivate?.();
    expect(onChoose).not.toHaveBeenCalled();
  });
});
