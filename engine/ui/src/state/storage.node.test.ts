// @vitest-environment node
import { describe, it, expect } from "vitest";
import { safeLocalStorage } from "./storage";

// `@engine/ui`'s public barrels must stay Node-importable (corpus decisions.md — "the engine's
// public barrels must stay Node-importable"). This file forces vitest's plain `node` environment
// (no jsdom, so `window` is genuinely undefined) to prove `safeLocalStorage()` degrades to `null`
// rather than throwing a ReferenceError, which is the failure mode a guard-less `window.localStorage`
// reach would have hit the moment any Node consumer imported this module.
describe("safeLocalStorage (no window)", () => {
  it("returns null instead of throwing when window is undefined", () => {
    expect(typeof window).toBe("undefined");
    expect(() => safeLocalStorage()).not.toThrow();
    expect(safeLocalStorage()).toBeNull();
  });
});
