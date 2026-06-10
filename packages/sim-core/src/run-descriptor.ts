// A run is fully described by (seed, maxDays, ticksPerDay) — same descriptor reproduces a byte-identical run.

/** Everything needed to reproduce a deterministic run. */
export interface RunDescriptor {
  seed: number;
  maxDays: number;
  ticksPerDay: number;
}

/** Serialize to `seed-maxDays-ticksPerDay` (unsigned-32-bit hex). No `#` or `run=` prefix. */
export function serializeRun(desc: RunDescriptor): string {
  return [desc.seed, desc.maxDays, desc.ticksPerDay]
    .map((n) => (n >>> 0).toString(16))
    .join("-");
}

/** Parse from URL hash. Tolerates leading `#` and optional `run=` prefix. Returns null if malformed. */
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
