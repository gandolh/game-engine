import { describe, it, expect } from "vitest";
import { createFatalScreen } from "./fatal";
import type { UINode } from "@engine/ui";
import { EDG } from "@engine/core";

function labelTexts(node: UINode, out: string[] = []): string[] {
  if (node.kind === "label") out.push(node.text);
  for (const child of node.children) labelTexts(child, out);
  return out;
}

describe("createFatalScreen", () => {
  it("first refresh reports changed and shows an Error's message", () => {
    const screen = createFatalScreen();
    const changed = screen.refresh({ error: new Error("boom") });
    expect(changed).toBe(true);
    expect(labelTexts(screen.root)).toContain("Failed to boot: boom");
  });

  it("stringifies a non-Error thrown value", () => {
    const screen = createFatalScreen();
    screen.refresh({ error: "plain string error" });
    expect(labelTexts(screen.root)).toContain("Failed to boot: plain string error");
  });

  it("refresh returns false when the error message is unchanged", () => {
    const screen = createFatalScreen();
    screen.refresh({ error: new Error("boom") });
    const again = screen.refresh({ error: new Error("boom") });
    expect(again).toBe(false);
  });

  it("message label uses an EDG32 colour", () => {
    const screen = createFatalScreen();
    const node = screen.root.children[0];
    expect(node?.kind).toBe("label");
    if (node?.kind === "label") expect(node.color).toBe(EDG.red);
  });
});
