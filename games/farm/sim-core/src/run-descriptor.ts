

/**
 * Bounds a share link must satisfy (audit-42). `parseRun` checked only `> 0`, so
 * `#run=1-1-ffffffff` parsed to `ticksPerDay = 4294967295` and `main.ts` fed it straight into
 * `client.init` — where it became `bootstrapSim`'s day length AND `SKIP_MAX_DAYS * ticksPerDay`,
 * the skip drain's cap (audit-41).
 *
 * These MUST stay in step with `INIT_BOUNDS` in `@farm/server`'s `validate-inbound.ts`: the client
 * refuses to build such a link, and the server refuses to serve one. Two independent checks, same
 * numbers, because neither side may trust the other.
 */
export const RUN_BOUNDS = {
  seed: { min: 0, max: 0xffff_ffff },
  ticksPerDay: { min: 1, max: 100_000 },
  maxDays: { min: 1, max: 10_000 },
} as const;

export interface RunDescriptor {
  seed: number;
  maxDays: number;
  ticksPerDay: number;
}

export function serializeRun(desc: RunDescriptor): string {
  return [desc.seed, desc.maxDays, desc.ticksPerDay]
    .map((n) => (n >>> 0).toString(16))
    .join("-");
}

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

  // Reject out-of-range rather than clamping: a share link IS the run's identity, so a silently
  // coerced link would render a different world than the URL names, with nothing telling the
  // player. `null` here makes the caller fall back to the default run.
  if (!inRange(seed, RUN_BOUNDS.seed)) return null;
  if (!inRange(maxDays, RUN_BOUNDS.maxDays)) return null;
  if (!inRange(ticksPerDay, RUN_BOUNDS.ticksPerDay)) return null;

  return { seed, maxDays, ticksPerDay };
}

function inRange(n: number, b: { min: number; max: number }): boolean {
  return n >= b.min && n <= b.max;
}

function parseHexField(raw: string | undefined): number | null {
  if (raw === undefined || !/^[0-9a-fA-F]+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 16);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
