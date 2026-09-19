// Host-side (browser boot) identity helper — NOT sim randomness. The id this produces is sent to
// the Farm server as `clientId` so each tab gets its own run; the sim never reads it and its value
// has no effect on tick output (see the call site in ../main.ts for the determinism note).
//
// Why this exists: `crypto.randomUUID` is secure-context-only (HTTPS or localhost). Opened over
// plain HTTP — e.g. a LAN IP like http://192.168.1.x:5173, the normal way to open this game on a
// second device — it is `undefined`, and calling it throws a TypeError synchronously during boot,
// before the first frame renders. This helper degrades instead of throwing.
export function hostClientId(): string {
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;

  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }

  // crypto.getRandomValues (unlike crypto.subtle and crypto.randomUUID) is available in insecure
  // contexts, so this rung keeps the same uniqueness properties as a real UUID without needing TLS.
  if (c && typeof c.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    // Set version (4) and variant (RFC 4122) bits so the shape matches a real v4 UUID. The `!`s are
    // safe: `bytes` is a fixed-length Uint8Array(16) and indices 6/8 are always in range —
    // noUncheckedIndexedAccess just can't see that statically.
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return (
      hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
      hex.slice(16, 20) + "-" + hex.slice(20)
    );
  }

  // Last resort: no crypto API at all. Math.random() is banned in SIM code (determinism — see
  // corpus/wiki/decisions.md -> Sim) because a tick's output must depend only on the tick count via
  // the seeded Rng. This is neither: it runs once, during client boot, before the sim exists, purely
  // to hand the server a per-tab identity string that sim logic never observes and that has no
  // effect on tick output. There is nothing here for a determinism check to disagree on.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
