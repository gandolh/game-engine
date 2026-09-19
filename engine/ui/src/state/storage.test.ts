import { describe, it, expect } from "vitest";
import { safeLocalStorage } from "./storage";

describe("safeLocalStorage", () => {
  it("returns a Storage in a browser-like (jsdom) environment", () => {
    const storage = safeLocalStorage();
    expect(storage).not.toBeNull();
    expect(typeof storage?.getItem).toBe("function");
    expect(typeof storage?.setItem).toBe("function");
  });
});
