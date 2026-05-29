import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HomeScreen, parseSeed, formatSeed, DEFAULT_SEED } from "./home-screen";

function seedInput(parent: HTMLElement): HTMLInputElement {
  const input = parent.querySelector("input") as HTMLInputElement;
  expect(input).toBeTruthy();
  return input;
}

function startButton(parent: HTMLElement): HTMLButtonElement {
  const btn = Array.from(parent.querySelectorAll("button")).find(
    (b) => b.textContent === "Start",
  );
  expect(btn).toBeTruthy();
  return btn as HTMLButtonElement;
}

function randomizeButton(parent: HTMLElement): HTMLButtonElement {
  const btn = Array.from(parent.querySelectorAll("button")).find(
    (b) => b.textContent === "Randomize",
  );
  expect(btn).toBeTruthy();
  return btn as HTMLButtonElement;
}

describe("parseSeed", () => {
  it("parses hex 0x... input", () => {
    expect(parseSeed("0xc0ffee")).toBe(0xc0ffee);
    expect(parseSeed("0xFF")).toBe(255);
  });

  it("parses decimal input", () => {
    expect(parseSeed("42")).toBe(42);
    expect(parseSeed("  100  ")).toBe(100);
  });

  it("falls back to default on empty / invalid / negative", () => {
    expect(parseSeed("")).toBe(DEFAULT_SEED);
    expect(parseSeed("   ")).toBe(DEFAULT_SEED);
    expect(parseSeed("not-a-number")).toBe(DEFAULT_SEED);
    expect(parseSeed("0xZZ")).toBe(DEFAULT_SEED);
    expect(parseSeed("-5")).toBe(DEFAULT_SEED);
  });

  it("honors an explicit fallback", () => {
    expect(parseSeed("", 7)).toBe(7);
  });

  it("floors fractional decimals", () => {
    expect(parseSeed("3.9")).toBe(3);
  });
});

describe("formatSeed", () => {
  it("renders a 0x-prefixed hex string", () => {
    expect(formatSeed(0xc0ffee)).toBe("0xc0ffee");
    expect(formatSeed(255)).toBe("0xff");
  });
});

describe("HomeScreen", () => {
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement("div");
    document.body.appendChild(parent);
  });

  afterEach(() => {
    parent.remove();
    vi.restoreAllMocks();
  });

  it("pre-fills the seed field with the default seed", () => {
    new HomeScreen(parent);
    expect(seedInput(parent).value).toBe(formatSeed(DEFAULT_SEED));
  });

  it("uses a custom default seed when provided", () => {
    new HomeScreen(parent, { defaultSeed: 1234 });
    expect(seedInput(parent).value).toBe(formatSeed(1234));
  });

  it("Randomize changes the field value", () => {
    // Math.random is the entropy source for Randomize (allowed in pre-sim UI).
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    new HomeScreen(parent);
    const input = seedInput(parent);
    const before = input.value;
    randomizeButton(parent).click();
    expect(input.value).not.toBe(before);
    // 0.5 * 0x100000000 = 0x80000000
    expect(input.value).toBe(formatSeed(0x80000000));
  });

  it("Start surfaces the entered hex seed", () => {
    const onStart = vi.fn();
    const home = new HomeScreen(parent);
    home.onStartClicked(onStart);
    seedInput(parent).value = "0x1234";
    startButton(parent).click();
    expect(onStart).toHaveBeenCalledWith(0x1234);
  });

  it("Start surfaces the entered decimal seed", () => {
    const onStart = vi.fn();
    const home = new HomeScreen(parent);
    home.onStartClicked(onStart);
    seedInput(parent).value = "987";
    startButton(parent).click();
    expect(onStart).toHaveBeenCalledWith(987);
  });

  it("Start falls back to the default seed on invalid input", () => {
    const onStart = vi.fn();
    const home = new HomeScreen(parent);
    home.onStartClicked(onStart);
    seedInput(parent).value = "garbage";
    startButton(parent).click();
    expect(onStart).toHaveBeenCalledWith(DEFAULT_SEED);
  });

  it("only fires Start once", () => {
    const onStart = vi.fn();
    const home = new HomeScreen(parent);
    home.onStartClicked(onStart);
    const btn = startButton(parent);
    btn.click();
    btn.click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
