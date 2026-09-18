/**
 * The wire boundary for `@farm/server` — audit-42.
 *
 * `@farm/server` is the one sim host that is actually deployed and publicly reachable, and before
 * this module it validated almost nothing it was sent: `init` destructured `seed`/`ticksPerDay`/
 * `maxDays` straight into `bootstrapSim`, `selectSlot` was assigned with no range check (a
 * subsequent `itemSlots[selectedSlot]` is `undefined` under `noUncheckedIndexedAccess`, and the
 * deref throws INSIDE the tick, where audit-17's fault policy halts the whole run), and unknown
 * `type`s fell through the switch silently.
 *
 * ONE narrowing guard, run ONCE, before anything reaches `bootstrapSim` or the ECS — rather than
 * scattered per-handler checks. Validation belongs at the boundary; the sim stays unaware that
 * untrusted input exists.
 *
 * ## Clamp or reject, and why
 *
 * **`init` fields are REJECTED, never coerced.** `seed`/`ticksPerDay`/`maxDays` are the identity of
 * a run: they are in the share link (`#run=<seed>-<maxDays>-<ticksPerDay>`) and in the run key. A
 * silently-clamped share link renders a DIFFERENT world than the URL names, and the player has no
 * way to know. Better to refuse and say why.
 *
 * **Per-tick input fields are DROPPED (the message is rejected, the run continues).** `selectSlot`,
 * `a`/`b`, `moveX`/`moveY` arrive many times a second; one malformed frame is not worth tearing a
 * run down for, and there is no identity to corrupt.
 *
 * **`speed`/`tickRateHz` stay CLAMPED** in the host, where they already were — they are pacing
 * knobs with no effect on a tick's output, so the nearest legal value is a fine answer.
 *
 * **An unknown `type` is dropped, not thrown** — a newer client talking to an older server should
 * degrade, not disconnect.
 */
import type { SimInbound } from "@farm/sim-core/protocol";

/** Bounds for the three run-identity fields. Deliberately generous: these exist to stop a socket
 *  minting a 4-billion-tick day, not to express game design. */
export const INIT_BOUNDS = {
  /** mulberry32 takes a u32; anything else is not a seed this sim can represent. */
  seed: { min: 0, max: 0xffff_ffff },
  /** 1200 is production; 20 is the headless/test rate. The ceiling bounds one day's work AND
   *  `SKIP_MAX_DAYS * ticksPerDay`, the skip drain's cap (audit-41). */
  ticksPerDay: { min: 1, max: 100_000 },
  /** 100 is the designed run length. */
  maxDays: { min: 1, max: 10_000 },
} as const;

/** The largest hotbar/inventory index the server will accept. The authoritative bound is the
 *  player's live `itemSlots.length`, re-checked in the host; this only keeps absurd values out. */
const MAX_SLOT_INDEX = 1023;

export interface ValidationError {
  /** Stable machine-readable code, so a client can act on it rather than parse prose. */
  code:
    | "not-an-object"
    | "missing-type"
    | "unknown-type"
    | "out-of-range"
    | "wrong-type";
  /** The offending field, when there is one. */
  field?: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; msg: SimInbound }
  | { ok: false; error: ValidationError };

function reject(
  code: ValidationError["code"],
  message: string,
  field?: string,
): ValidationResult {
  return { ok: false, error: field === undefined ? { code, message } : { code, field, message } };
}

function isBoundedInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function requireBoundedInt(
  raw: Record<string, unknown>,
  field: keyof typeof INIT_BOUNDS,
): ValidationResult | null {
  const { min, max } = INIT_BOUNDS[field];
  const v = raw[field];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return reject("wrong-type", `init.${field} must be a finite number`, field);
  }
  if (!isBoundedInt(v, min, max)) {
    return reject(
      "out-of-range",
      `init.${field} must be an integer in [${String(min)}, ${String(max)}] — got ${String(v)}`,
      field,
    );
  }
  return null;
}

function isAxis(v: unknown, a: string, b: string): boolean {
  return v === null || v === a || v === b;
}

/**
 * Narrow one inbound frame. Never throws — a malformed frame is a value, not an exception, because
 * a throw here would surface as an `uncaughtException` on a publicly reachable socket.
 */
export function validateInbound(raw: unknown): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return reject("not-an-object", "message must be a JSON object");
  }
  const m = raw as Record<string, unknown>;
  if (typeof m["type"] !== "string") {
    return reject("missing-type", "message.type must be a string");
  }

  switch (m["type"]) {
    // --- no payload -------------------------------------------------------
    case "stop":
    case "step":
    case "skipToHighlight":
      return { ok: true, msg: { type: m["type"] } as SimInbound };

    // --- booleans ---------------------------------------------------------
    case "pause":
      if (typeof m["paused"] !== "boolean") {
        return reject("wrong-type", "pause.paused must be a boolean", "paused");
      }
      return { ok: true, msg: { type: "pause", paused: m["paused"] } };

    case "profile":
      if (typeof m["enabled"] !== "boolean") {
        return reject("wrong-type", "profile.enabled must be a boolean", "enabled");
      }
      return { ok: true, msg: { type: "profile", enabled: m["enabled"] } };

    // --- clamped pacing ---------------------------------------------------
    case "speed":
      // Clamped downstream in the host; only the TYPE is a boundary concern. A string here used to
      // sail through `Number.isFinite("fast")` → false → multiplier 1, which happens to be safe —
      // but by accident, not by contract.
      if (typeof m["multiplier"] !== "number" || !Number.isFinite(m["multiplier"])) {
        return reject("wrong-type", "speed.multiplier must be a finite number", "multiplier");
      }
      return { ok: true, msg: { type: "speed", multiplier: m["multiplier"] } };

    // --- run identity: rejected, never coerced ----------------------------
    case "init": {
      for (const field of ["seed", "ticksPerDay", "maxDays"] as const) {
        const bad = requireBoundedInt(m, field);
        if (bad !== null) return bad;
      }
      if (typeof m["tickRateHz"] !== "number" || !Number.isFinite(m["tickRateHz"])) {
        return reject("wrong-type", "init.tickRateHz must be a finite number", "tickRateHz");
      }
      if (m["clientId"] !== undefined && typeof m["clientId"] !== "string") {
        return reject("wrong-type", "init.clientId must be a string when present", "clientId");
      }
      if (typeof m["clientId"] === "string" && m["clientId"].length > 128) {
        return reject("out-of-range", "init.clientId must be at most 128 characters", "clientId");
      }
      const msg: SimInbound = {
        type: "init",
        seed: m["seed"] as number,
        ticksPerDay: m["ticksPerDay"] as number,
        maxDays: m["maxDays"] as number,
        tickRateHz: m["tickRateHz"] as number,
      };
      if (typeof m["clientId"] === "string") msg.clientId = m["clientId"];
      // `pathfinderWasm` is deliberately NOT accepted over the wire: the server owns its own
      // artifact (see audit-40), and an ArrayBuffer cannot survive JSON anyway.
      return { ok: true, msg };
    }

    // --- per-tick input: dropped on malformed ------------------------------
    case "input": {
      if (!isAxis(m["moveX"], "left", "right")) {
        return reject("wrong-type", 'input.moveX must be "left" | "right" | null', "moveX");
      }
      if (!isAxis(m["moveY"], "up", "down")) {
        return reject("wrong-type", 'input.moveY must be "up" | "down" | null', "moveY");
      }
      if (typeof m["action"] !== "boolean") {
        return reject("wrong-type", "input.action must be a boolean", "action");
      }
      const slot = m["selectSlot"];
      if (slot !== null && !isBoundedInt(slot, 0, MAX_SLOT_INDEX)) {
        // THE ONE THAT FAULTED A RUN: an out-of-range index reached
        // `player.selectedSlot`, and the next `itemSlots[selectedSlot]` deref threw inside the
        // tick, where audit-17's fault policy halts the run.
        return reject(
          "out-of-range",
          `input.selectSlot must be null or an integer in [0, ${String(MAX_SLOT_INDEX)}]`,
          "selectSlot",
        );
      }
      const tile = m["actionTile"];
      if (tile !== undefined && tile !== null) {
        if (typeof tile !== "object" || Array.isArray(tile)) {
          return reject("wrong-type", "input.actionTile must be an object or null", "actionTile");
        }
        const t = tile as Record<string, unknown>;
        if (
          typeof t["x"] !== "number" || !Number.isFinite(t["x"]) ||
          typeof t["y"] !== "number" || !Number.isFinite(t["y"])
        ) {
          return reject("wrong-type", "input.actionTile.x/y must be finite numbers", "actionTile");
        }
      }
      const msg: SimInbound = {
        type: "input",
        moveX: m["moveX"] as "left" | "right" | null,
        moveY: m["moveY"] as "up" | "down" | null,
        action: m["action"],
        selectSlot: slot as number | null,
      };
      if (tile !== undefined) {
        msg.actionTile =
          tile === null ? null : { x: (tile as { x: number }).x, y: (tile as { y: number }).y };
      }
      return { ok: true, msg };
    }

    case "swap-slots": {
      for (const field of ["a", "b"] as const) {
        if (!isBoundedInt(m[field], 0, MAX_SLOT_INDEX)) {
          return reject(
            "out-of-range",
            `swap-slots.${field} must be an integer in [0, ${String(MAX_SLOT_INDEX)}]`,
            field,
          );
        }
      }
      return { ok: true, msg: { type: "swap-slots", a: m["a"] as number, b: m["b"] as number } };
    }

    default:
      return reject("unknown-type", `unknown message type "${m["type"]}"`);
  }
}
