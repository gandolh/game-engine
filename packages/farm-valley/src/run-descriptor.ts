// brief-17: save/replay — the run descriptor + URL-hash serialization.
//
// A fully deterministic Farm Valley run is described entirely by three numbers:
// the RNG seed, the day count, and the ticks-per-day. There are currently no
// sim-affecting external inputs (the viewer only pans/zooms/focuses, which is
// presentation-only), so this descriptor is the *complete* save format — opening
// the same descriptor reproduces a byte-identical run.
//
// Extension point: if/when interactive, sim-affecting inputs land, the engine's
// `InputLog` (packages/engine/src/runtime/input-log.ts) is where the recorded
// per-tick input stream would live, and this descriptor would gain a reference
// to it. We deliberately do NOT wire InputLog today — it would be dead code.

/** Everything needed to reproduce a deterministic run. */
export interface RunDescriptor {
  seed: number;
  maxDays: number;
  ticksPerDay: number;
}

/**
 * Serialize a run descriptor to a compact, URL-hash-safe string of the form
 * `seed-maxDays-ticksPerDay`, where each field is an unsigned-32-bit hex number.
 * Round-trippable via {@link parseRun}. No `#` or `run=` prefix is added here.
 */
export function serializeRun(desc: RunDescriptor): string {
  return [desc.seed, desc.maxDays, desc.ticksPerDay]
    .map((n) => (n >>> 0).toString(16))
    .join("-");
}

/**
 * Parse a run descriptor from a URL hash fragment. Tolerant of a leading `#`
 * and an optional `run=` prefix (so `#run=abc-def-1`, `run=...`, and the bare
 * `abc-def-1` all parse). Returns null on anything malformed, empty, or partial.
 */
export function parseRun(hash: string): RunDescriptor | null {
  if (typeof hash !== "string") return null;

  let s = hash.trim();
  if (s.startsWith("#")) s = s.slice(1);
  if (s.startsWith("run=")) s = s.slice("run=".length);
  if (s === "") return null;

  const parts = s.split("-");
  if (parts.length !== 3) return null;

  const seed = parseHexField(parts[0]);
  const maxDays = parseHexField(parts[1]);
  const ticksPerDay = parseHexField(parts[2]);
  if (seed === null || maxDays === null || ticksPerDay === null) return null;

  // A run with zero days or zero ticks-per-day can't produce anything useful.
  if (maxDays <= 0 || ticksPerDay <= 0) return null;

  return { seed, maxDays, ticksPerDay };
}

/** Parse one hex field; returns null unless it's a clean non-negative hex int. */
function parseHexField(raw: string | undefined): number | null {
  if (raw === undefined || !/^[0-9a-fA-F]+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 16);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
