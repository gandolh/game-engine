/**
 * audit-42 — the wire boundary, driven with junk.
 *
 * `@farm/server` is the one sim host that is actually deployed and publicly reachable, and neither
 * WS server in this repo had a malformed-input test. The bar here is not "rejects bad input" but
 * **never throws and never mutates sim state** — a throw on a public socket surfaces as an
 * `uncaughtException`, and a value that slips through reaches the ECS, where audit-17's tick-fault
 * policy halts the whole run on the deref.
 */
import { describe, it, expect } from "vitest";
import { validateInbound, INIT_BOUNDS } from "./validate-inbound";
import { SimHost } from "./sim-host";
import type { SimOutbound } from "@farm/sim-core/protocol";

/** Every frame below must be REFUSED, and refusing must not throw. */
const JUNK: ReadonlyArray<readonly [string, unknown]> = [
  ["empty object", {}],
  ["null", null],
  ["an array", [{ type: "stop" }]],
  ["a bare string", "stop"],
  ["a number", 7],
  ["unknown type", { type: "teleport-everyone" }],
  ["type is not a string", { type: 42 }],
  ["moveX as a number", { type: "input", moveX: 3, moveY: null, action: false, selectSlot: null }],
  ["moveX as a bogus string", { type: "input", moveX: "sideways", moveY: null, action: false, selectSlot: null }],
  ["moveY as a bogus string", { type: "input", moveX: null, moveY: "sideways", action: false, selectSlot: null }],
  ["action missing", { type: "input", moveX: null, moveY: null, selectSlot: null }],
  ["selectSlot negative", { type: "input", moveX: null, moveY: null, action: false, selectSlot: -1 }],
  ["selectSlot fractional", { type: "input", moveX: null, moveY: null, action: false, selectSlot: 1.5 }],
  ["selectSlot absurd", { type: "input", moveX: null, moveY: null, action: false, selectSlot: 2 ** 31 }],
  ["selectSlot NaN", { type: "input", moveX: null, moveY: null, action: false, selectSlot: NaN }],
  ["actionTile with NaN", { type: "input", moveX: null, moveY: null, action: false, selectSlot: null, actionTile: { x: NaN, y: 0 } }],
  ["actionTile as an array", { type: "input", moveX: null, moveY: null, action: false, selectSlot: null, actionTile: [1, 2] }],
  ["swap-slots negative", { type: "swap-slots", a: -1, b: 0 }],
  ["swap-slots as strings", { type: "swap-slots", a: "0", b: "1" }],
  ["swap-slots missing b", { type: "swap-slots", a: 0 }],
  ["speed as a word", { type: "speed", multiplier: "fast" }],
  ["speed as Infinity", { type: "speed", multiplier: Infinity }],
  ["pause as a number", { type: "pause", paused: 1 }],
  ["profile.enabled as a string", { type: "profile", enabled: "yes" }],
  ["init ticksPerDay = u32 max (the share-link case)", { type: "init", seed: 1, ticksPerDay: 4294967295, maxDays: 1, tickRateHz: 20 }],
  ["init maxDays absurd", { type: "init", seed: 1, ticksPerDay: 20, maxDays: 1e9, tickRateHz: 20 }],
  ["init ticksPerDay zero", { type: "init", seed: 1, ticksPerDay: 0, maxDays: 5, tickRateHz: 20 }],
  ["init ticksPerDay fractional", { type: "init", seed: 1, ticksPerDay: 20.5, maxDays: 5, tickRateHz: 20 }],
  ["init seed negative", { type: "init", seed: -1, ticksPerDay: 20, maxDays: 5, tickRateHz: 20 }],
  ["init seed beyond u32", { type: "init", seed: 2 ** 33, ticksPerDay: 20, maxDays: 5, tickRateHz: 20 }],
  ["init seed NaN", { type: "init", seed: NaN, ticksPerDay: 20, maxDays: 5, tickRateHz: 20 }],
  ["init seed as a string", { type: "init", seed: "1", ticksPerDay: 20, maxDays: 5, tickRateHz: 20 }],
  ["init tickRateHz missing", { type: "init", seed: 1, ticksPerDay: 20, maxDays: 5 }],
  ["init clientId as an object", { type: "init", seed: 1, ticksPerDay: 20, maxDays: 5, tickRateHz: 20, clientId: {} }],
  ["init clientId absurdly long", { type: "init", seed: 1, ticksPerDay: 20, maxDays: 5, tickRateHz: 20, clientId: "x".repeat(5000) }],
];

describe("validateInbound — junk is refused, never thrown on", () => {
  for (const [name, frame] of JUNK) {
    it(`refuses ${name}`, () => {
      let result: ReturnType<typeof validateInbound> | undefined;
      expect(() => { result = validateInbound(frame); }).not.toThrow();
      expect(result!.ok).toBe(false);
      if (!result!.ok) {
        // Structured, so a client can branch on it rather than parse prose.
        expect(typeof result!.error.code).toBe("string");
        expect(result!.error.message.length).toBeGreaterThan(0);
      }
    });
  }
});

describe("validateInbound — well-formed traffic passes through unchanged", () => {
  const GOOD: ReadonlyArray<readonly [string, unknown]> = [
    ["stop", { type: "stop" }],
    ["step", { type: "step" }],
    ["skipToHighlight", { type: "skipToHighlight" }],
    ["pause", { type: "pause", paused: true }],
    ["profile", { type: "profile", enabled: false }],
    ["speed", { type: "speed", multiplier: 4 }],
    ["init at production settings", { type: "init", seed: 12345, ticksPerDay: 1200, maxDays: 100, tickRateHz: 20 }],
    ["init at headless settings", { type: "init", seed: 0, ticksPerDay: 20, maxDays: 3, tickRateHz: 60 }],
    ["init with a clientId", { type: "init", seed: 1, ticksPerDay: 20, maxDays: 5, tickRateHz: 20, clientId: "tab-a" }],
    ["input, idle", { type: "input", moveX: null, moveY: null, action: false, selectSlot: null }],
    ["input, walking + acting", { type: "input", moveX: "right", moveY: "up", action: true, selectSlot: 3 }],
    ["input with an actionTile", { type: "input", moveX: null, moveY: null, action: true, selectSlot: 0, actionTile: { x: 4, y: 9 } }],
    ["input with a null actionTile", { type: "input", moveX: null, moveY: null, action: false, selectSlot: null, actionTile: null }],
    ["swap-slots", { type: "swap-slots", a: 0, b: 7 }],
  ];

  for (const [name, frame] of GOOD) {
    it(`accepts ${name}`, () => {
      const result = validateInbound(frame);
      expect(result.ok, JSON.stringify(result)).toBe(true);
    });
  }

  it("accepts the exact edges of every init bound", () => {
    for (const [lo, hi] of [
      [INIT_BOUNDS.seed.min, INIT_BOUNDS.seed.max],
    ] as const) {
      for (const seed of [lo, hi]) {
        expect(validateInbound({ type: "init", seed, ticksPerDay: 20, maxDays: 5, tickRateHz: 20 }).ok).toBe(true);
      }
    }
    for (const ticksPerDay of [INIT_BOUNDS.ticksPerDay.min, INIT_BOUNDS.ticksPerDay.max]) {
      expect(validateInbound({ type: "init", seed: 1, ticksPerDay, maxDays: 5, tickRateHz: 20 }).ok).toBe(true);
    }
    for (const maxDays of [INIT_BOUNDS.maxDays.min, INIT_BOUNDS.maxDays.max]) {
      expect(validateInbound({ type: "init", seed: 1, ticksPerDay: 20, maxDays, tickRateHz: 20 }).ok).toBe(true);
    }
  });

  it("is one step OUTSIDE every init bound away from refusal", () => {
    expect(validateInbound({ type: "init", seed: INIT_BOUNDS.seed.max + 1, ticksPerDay: 20, maxDays: 5, tickRateHz: 20 }).ok).toBe(false);
    expect(validateInbound({ type: "init", seed: 1, ticksPerDay: INIT_BOUNDS.ticksPerDay.max + 1, maxDays: 5, tickRateHz: 20 }).ok).toBe(false);
    expect(validateInbound({ type: "init", seed: 1, ticksPerDay: 20, maxDays: INIT_BOUNDS.maxDays.max + 1, tickRateHz: 20 }).ok).toBe(false);
  });

  it("does not invent fields — an accepted frame carries only what was sent", () => {
    const r = validateInbound({ type: "input", moveX: "left", moveY: null, action: false, selectSlot: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.msg).sort()).toEqual(["action", "moveX", "moveY", "selectSlot", "type"]);
  });

  it("strips unknown extra properties rather than forwarding them", () => {
    const r = validateInbound({ type: "pause", paused: true, evil: "payload" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.msg).toEqual({ type: "pause", paused: true });
  });

  it("never accepts pathfinderWasm over the wire", () => {
    // The server owns its own artifact (audit-40); a socket must not be able to substitute one.
    const r = validateInbound({
      type: "init", seed: 1, ticksPerDay: 20, maxDays: 5, tickRateHz: 20, pathfinderWasm: [1, 2, 3],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect("pathfinderWasm" in r.msg).toBe(false);
  });
});

describe("SimHost.handleInbound — junk leaves the host inert", () => {
  it("never throws and starts no run for any junk frame", () => {
    const sent: SimOutbound[] = [];
    const host = new SimHost((m) => sent.push(m));

    for (const [, frame] of JUNK) {
      const result = validateInbound(frame);
      // The boundary refuses everything here; nothing should reach the host at all.
      expect(result.ok).toBe(false);
    }

    // Belt and braces: even if a junk frame DID reach it, the host must not throw. Push the
    // refused frames through anyway, exactly as an unvalidated build would have.
    for (const [name, frame] of JUNK) {
      expect(() => {
        host.handleInbound(frame as never);
      }, name).not.toThrow();
    }

    // No run was ever started, so no snapshot/static-layer was emitted.
    expect(sent.filter((m) => m.type === "snapshot" || m.type === "static-layer")).toEqual([]);
    host.stop();
  });
});
