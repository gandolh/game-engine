import { describe, it, expect, vi, afterEach } from "vitest";
import { createHomeScreen, formatSeed, parseSeed, DEFAULT_SEED } from "./home-screen";
import type { UINode, ButtonNode } from "@engine/ui";

function labelTexts(node: UINode, out: string[] = []): string[] {
  if (node.kind === "label") out.push(node.text);
  for (const child of node.children) labelTexts(child, out);
  return out;
}

function findButtons(node: UINode, out: ButtonNode[] = []): ButtonNode[] {
  if (node.kind === "button") out.push(node);
  for (const child of node.children) findButtons(child, out);
  return out;
}

describe("parseSeed / formatSeed", () => {
  it("parses hex and decimal, falling back on invalid input", () => {
    expect(parseSeed("0xFF")).toBe(255);
    expect(parseSeed("42")).toBe(42);
    expect(parseSeed("")).toBe(DEFAULT_SEED);
    expect(parseSeed("not a number")).toBe(DEFAULT_SEED);
    expect(parseSeed("-5")).toBe(DEFAULT_SEED);
  });

  it("formats a seed as 0x-prefixed hex", () => {
    expect(formatSeed(255)).toBe("0xff");
  });
});

describe("createHomeScreen", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("creates a DOM seed input appended to the document, prefilled with the default seed", () => {
    const screen = createHomeScreen({ onStart: () => {} });
    expect(screen.seedInputEl).toBeInstanceOf(HTMLInputElement);
    expect(document.body.contains(screen.seedInputEl)).toBe(true);
    expect(screen.seedInputEl.value).toBe(formatSeed(DEFAULT_SEED));
    screen.destroy();
  });

  it("getSeedValue reads the DOM input's current value", () => {
    const screen = createHomeScreen({ onStart: () => {} });
    screen.seedInputEl.value = "0x1234";
    expect(screen.getSeedValue()).toBe(0x1234);
    screen.destroy();
  });

  it("renders title/subtitle/hint labels and Start + Randomize buttons in canvas", () => {
    const screen = createHomeScreen({ onStart: () => {} }, { title: "Farm Valley" });
    const texts = labelTexts(screen.root);
    expect(texts).toContain("Farm Valley");
    expect(texts).toContain("Press Enter or click Start");

    const buttons = findButtons(screen.root);
    expect(buttons.map((b) => b.label)).toEqual(expect.arrayContaining(["Start", "Randomize"]));
    screen.destroy();
  });

  it("Start button calls onStart with the parsed seed value", () => {
    const onStart = vi.fn();
    const screen = createHomeScreen({ onStart });
    screen.seedInputEl.value = "0xABCD";
    const buttons = findButtons(screen.root);
    const startBtn = buttons.find((b) => b.label === "Start");
    startBtn?.onActivate?.();
    expect(onStart).toHaveBeenCalledWith(0xabcd);
    screen.destroy();
  });

  it("Enter in the seed input triggers onStart", () => {
    const onStart = vi.fn();
    const screen = createHomeScreen({ onStart });
    screen.seedInputEl.value = "0x99";
    screen.seedInputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onStart).toHaveBeenCalledWith(0x99);
    screen.destroy();
  });

  it("Randomize button writes a fresh seed into the DOM input and calls onRandomize", () => {
    const onRandomize = vi.fn();
    const screen = createHomeScreen({ onStart: () => {}, onRandomize });
    const before = screen.seedInputEl.value;
    const buttons = findButtons(screen.root);
    const randomizeBtn = buttons.find((b) => b.label === "Randomize");
    randomizeBtn?.onActivate?.();
    expect(screen.seedInputEl.value).not.toBe(before);
    expect(onRandomize).toHaveBeenCalledOnce();
    screen.destroy();
  });

  it("destroy removes the DOM seed input", () => {
    const screen = createHomeScreen({ onStart: () => {} });
    expect(document.body.contains(screen.seedInputEl)).toBe(true);
    screen.destroy();
    expect(document.body.contains(screen.seedInputEl)).toBe(false);
  });
});
