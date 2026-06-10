/**
 * Catchable fish. Shore fish (minnow/bass/salmon) from any isle edge;
 * coral specials (coral-trout/lobster) only at a coral reef reached by boat.
 */
export type FishKind =
  | "minnow" | "bass" | "salmon"     // shore fish
  | "coral-trout" | "lobster";       // coral-reef specials (boat only)

export const FISH_KINDS: readonly FishKind[] = [
  "minnow", "bass", "salmon", "coral-trout", "lobster",
];

/** The shore-only subset (used by the shore-fishing weight tables). */
export const SHORE_FISH_KINDS: readonly FishKind[] = ["minnow", "bass", "salmon"];

export const CORAL_FISH_KINDS: readonly FishKind[] = ["coral-trout", "lobster"];

/** Gold each fish is worth when sold to the shopkeeper. */
export const FISH_VALUE: Record<FishKind, number> = {
  minnow: 1,
  bass:   3,
  salmon: 5,
  "coral-trout": 12,
  lobster:       20,
};

/** Busy-time bounds for a fishing cast, in ticks at 20 Hz (5 s … 30 s). */
export const FISH_MIN_TICKS = 100;
export const FISH_MAX_TICKS = 600;

/** Catch weights for calm shore (bubble spot tilts toward rarer fish). Picker normalises. */
export const FISH_WEIGHTS_CALM:   Record<FishKind, number> = { minnow: 80, bass: 17, salmon: 3, "coral-trout": 0, lobster: 0 };
export const FISH_WEIGHTS_BUBBLE: Record<FishKind, number> = { minnow: 25, bass: 45, salmon: 30, "coral-trout": 0, lobster: 0 };

/** Coral-reef catch weights (reef always lands a special). Skill bonus shifts coral-trout → lobster. */
export const CORAL_WEIGHTS: Record<FishKind, number> = {
  minnow: 0, bass: 0, salmon: 0,
  "coral-trout": 78,
  lobster:       22,
};

/** True if a fish kind is a coral-reef special (not shore-catchable). */
export function isCoralFish(kind: FishKind): boolean {
  return kind === "coral-trout" || kind === "lobster";
}

/** A fresh all-zero fish tally (every kind, incl. coral specials). Use this to
 *  lazily initialise `inventory.fish` so it always has every key present. */
export function zeroFish(): Record<FishKind, number> {
  return { minnow: 0, bass: 0, salmon: 0, "coral-trout": 0, lobster: 0 };
}
