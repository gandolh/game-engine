

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

  if (maxDays <= 0 || ticksPerDay <= 0) return null;

  return { seed, maxDays, ticksPerDay };
}

function parseHexField(raw: string | undefined): number | null {
  if (raw === undefined || !/^[0-9a-fA-F]+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 16);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
