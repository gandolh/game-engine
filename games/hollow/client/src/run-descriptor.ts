/**
 * `run-descriptor.ts` — PURE codec for a shareable run: `{seed, persona,
 * interventionLog}` <-> a compact, URL-hash-safe string (chunk hollow-11b).
 *
 * A run is fully reproducible from these three fields (CLAUDE.md's
 * determinism contract): `seed` + `persona` (a `PersonaSeed`, hollow-11a)
 * decide the founding population/world, and `interventionLog` (every
 * `Intervention` the director fired, in schedule order, hollow-11a) decides
 * every environmental shock. `main.ts`'s "Share" button encodes the CURRENT
 * run's triple into `location.hash`; loading that hash re-decodes it and
 * boots the worker with `{seed, persona, replayLog: interventionLog}` —
 * `sim.loadInterventionLog` (hollow-11a) replays each shock's exact
 * (tick, seq) pair, so the replayed town is byte-identical.
 *
 * Encoding: `JSON.stringify` -> UTF-8 bytes -> URL-safe base64 (`+`/`/` ->
 * `-`/`_`, no `=` padding) — plain and inspectable (not intentionally
 * obfuscated), just URL-hash-safe. No compression: run descriptors are small
 * (a handful of archetype rows + a short intervention list), so this
 * prioritizes a dependency-free, trivially-reversible codec over byte count.
 */
import type { PersonaSeed } from "@hollow/sim-core/persona";
import type { Intervention } from "@hollow/sim-core/protocols";

export interface RunDescriptor {
  readonly seed: number;
  readonly persona: PersonaSeed;
  readonly interventionLog: readonly Intervention[];
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes `descriptor` into a compact, URL-hash-safe string. Pure. */
export function encodeRunDescriptor(descriptor: RunDescriptor): string {
  const json = JSON.stringify(descriptor);
  return toBase64Url(new TextEncoder().encode(json));
}

/**
 * Decodes a string produced by `encodeRunDescriptor` back into a
 * `RunDescriptor`. Pure — throws (doesn't silently coerce) on malformed
 * input, matching `JSON.parse`'s own contract; `main.ts` is expected to
 * `try`/`catch` this at the `location.hash` boundary since a hash the user
 * hand-edited or an old bookmark could be anything.
 */
export function decodeRunDescriptor(encoded: string): RunDescriptor {
  const json = new TextDecoder().decode(fromBase64Url(encoded));
  return JSON.parse(json) as RunDescriptor;
}
