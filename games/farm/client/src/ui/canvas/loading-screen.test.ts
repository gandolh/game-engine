import { describe, it, expect } from "vitest";
import { createLoadingScreen } from "./loading-screen";
import type { UINode } from "@engine/ui";

function labelTexts(node: UINode, out: string[] = []): string[] {
  if (node.kind === "label") out.push(node.text);
  for (const child of node.children) labelTexts(child, out);
  return out;
}

describe("createLoadingScreen", () => {
  it("first refresh reports changed and renders the seed + progress text", () => {
    const screen = createLoadingScreen();
    const changed = screen.refresh({ seed: 0xc0ffee, progress: "Spawning farmers..." });
    expect(changed).toBe(true);

    const texts = labelTexts(screen.root);
    expect(texts).toContain("Seed 0xc0ffee");
    expect(texts).toContain("Spawning farmers...");
  });

  it("hides the seed line when seed is undefined", () => {
    const screen = createLoadingScreen();
    screen.refresh({ progress: "Loading..." });
    const texts = labelTexts(screen.root);
    expect(texts).not.toContain(expect.stringMatching(/^Seed /));
    expect(texts).toContain("");
  });

  it("refresh returns false when nothing layout-affecting changed", () => {
    const screen = createLoadingScreen();
    screen.refresh({ seed: 1, progress: "A" });
    const again = screen.refresh({ seed: 1, progress: "A" });
    expect(again).toBe(false);
  });

  it("refresh returns true again when progress text changes", () => {
    const screen = createLoadingScreen();
    screen.refresh({ seed: 1, progress: "A" });
    const changed = screen.refresh({ seed: 1, progress: "B" });
    expect(changed).toBe(true);
  });
});
