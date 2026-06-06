// ── Fishing ────────────────────────────────────────────────────────────────
//
// Fishing is a low-AP, high-time activity: it costs 1 AP but the farmer is busy
// for a random 5–30 seconds (at 20 Hz → 100–600 ticks), then lands one of three
// fish. There is exactly ONE kind of fishing rod and it has NO durability
// (modelled with `durability: Infinity` so the shared tool plumbing never
// breaks or prunes it). You fish while standing adjacent to a fishing spot.

/** The three catchable fish, in ascending value. */
export type FishKind = "minnow" | "bass" | "salmon";

export const FISH_KINDS: readonly FishKind[] = ["minnow", "bass", "salmon"];

/** Gold each fish is worth when sold to the shopkeeper. */
export const FISH_VALUE: Record<FishKind, number> = {
  minnow: 1,
  bass:   3,
  salmon: 5,
};

/** Fishing time bounds, in ticks at 20 Hz (5 s … 30 s). */
export const FISH_MIN_TICKS = 100; // 5 s
export const FISH_MAX_TICKS = 600; // 30 s

/**
 * Catch odds, as [minnow, bass, salmon] weights. Plain ocean (calm water) mostly
 * lands the cheap minnow; casting into a bubble spot tilts heavily toward the
 * rarer, more valuable bass/salmon. Weights need not sum to 1 — the picker
 * normalises. This is the whole point of the bubbles: a rarity bonus.
 */
export const FISH_WEIGHTS_CALM:   Record<FishKind, number> = { minnow: 80, bass: 17, salmon: 3 };
export const FISH_WEIGHTS_BUBBLE: Record<FishKind, number> = { minnow: 25, bass: 45, salmon: 30 };
