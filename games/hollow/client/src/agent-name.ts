/**
 * `agentName` — a stable, deterministic display name derived from an agent
 * id (chunk hollow-09c), for both the `[T]` tag overlay (`render3d/overlay.ts`)
 * and the inspect panel / worker-side `InspectDetail` assembly
 * (`worker/inspect.ts`). Deliberately NOT drawn from any `Rng` (never fed
 * into the sim, never affects sim state) — just a pure id -> bits -> two
 * syllables mapping, same shape as `render3d/humanoid.ts`'s `hashAgentId`
 * (a self-contained copy, not an import: this module is used from the
 * Worker too, and shouldn't pull in `@engine/core/render3d` transitively
 * just for a hash function).
 */

/** Deterministic integer hash (Murmur-ish finalizer) — id -> 32-bit uint. */
function hashId(id: number): number {
  let h = (id ^ 0x2545f491) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** First-syllable list — cozy, short, village-name-shaped. */
const SYLLABLE_A = [
  "Bram", "Cor", "Del", "Eda", "Fen", "Gil", "Hes", "Ivo", "Jor", "Kes",
  "Lir", "Mox", "Nan", "Or", "Pell", "Quen", "Rowe", "Sab", "Tam", "Ulf",
  "Vex", "Wren", "Yara", "Zeph",
] as const;

/** Second-syllable list — settlement-flavored suffixes. */
const SYLLABLE_B = [
  "wick", "ley", "mund", "ric", "wyn", "ford", "holt", "mere", "dale", "thorn",
  "vale", "stead", "wood", "crest", "haven", "brook", "field", "moor", "gate", "burn",
] as const;

/**
 * A stable "Firstsecond" display name for `id` — the same id always maps to
 * the same name (pure, no RNG, no clock); different ids usually differ
 * (collisions are cosmetically fine — two agents sharing a display name
 * doesn't break anything, `id` is still the actual identity).
 */
export function agentName(id: number): string {
  const h = hashId(id);
  const a = SYLLABLE_A[h % SYLLABLE_A.length]!;
  const b = SYLLABLE_B[Math.floor(h / SYLLABLE_A.length) % SYLLABLE_B.length]!;
  return `${a}${b}`;
}
