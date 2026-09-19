import { describe, it, expect, afterEach } from "vitest";
import { hostClientId } from "./host-client-id";

// crypto is a getter-only global in jsdom/browsers, so we swap individual methods on the live
// object with Object.defineProperty rather than reassigning `globalThis.crypto`.
const realRandomUUID = crypto.randomUUID.bind(crypto);
const realGetRandomValues = crypto.getRandomValues.bind(crypto);

function stubRandomUUID(value: (() => string) | undefined): void {
  Object.defineProperty(crypto, "randomUUID", {
    value,
    configurable: true,
    writable: true,
  });
}

function stubGetRandomValues(value: typeof crypto.getRandomValues | undefined): void {
  Object.defineProperty(crypto, "getRandomValues", {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  stubRandomUUID(realRandomUUID);
  stubGetRandomValues(realGetRandomValues);
});

describe("boot path without the fix (red demonstration)", () => {
  it("the OLD call-site expression `crypto.randomUUID()` throws when randomUUID is undefined", () => {
    // This reproduces games/farm/client/src/main.ts's pre-fix call site directly: a non-secure
    // context (e.g. http://192.168.1.x:5173) makes crypto.randomUUID undefined, and calling it
    // throws synchronously during boot, before the first frame — the bug this spec is about.
    stubRandomUUID(undefined);
    const oldCallSite = (): string => crypto.randomUUID();
    expect(oldCallSite).toThrow(TypeError);
  });

  it("the NEW helper returns a usable id under the same stubbed condition", () => {
    stubRandomUUID(undefined);
    const id = hostClientId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});

describe("hostClientId three-rung fallback", () => {
  it("rung 1: uses crypto.randomUUID() when available", () => {
    stubRandomUUID(() => "11111111-1111-4111-8111-111111111111");
    expect(hostClientId()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rung 2: assembles a v4-shaped id from crypto.getRandomValues when randomUUID is absent", () => {
    stubRandomUUID(undefined);
    // real getRandomValues is left in place for this case

    const a = hostClientId();
    const b = hostClientId();

    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
    // v4-shaped: 8-4-4-4-12 hex, version nibble 4, variant nibble in {8,9,a,b}
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("rung 3: falls back to timestamp + Math.random() when neither API is present", () => {
    stubRandomUUID(undefined);
    stubGetRandomValues(undefined);

    const a = hostClientId();
    const b = hostClientId();

    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});
