
export type FishKind =
  | "minnow" | "bass" | "salmon"     
  | "coral-trout" | "lobster";       

export const FISH_KINDS: readonly FishKind[] = [
  "minnow", "bass", "salmon", "coral-trout", "lobster",
];

export const SHORE_FISH_KINDS: readonly FishKind[] = ["minnow", "bass", "salmon"];

export const CORAL_FISH_KINDS: readonly FishKind[] = ["coral-trout", "lobster"];

export const FISH_VALUE: Record<FishKind, number> = {
  minnow: 1,
  bass:   3,
  salmon: 5,
  "coral-trout": 12,
  lobster:       20,
};

export const FISH_MIN_TICKS = 100;
export const FISH_MAX_TICKS = 600;

export const FISH_WEIGHTS_CALM:   Record<FishKind, number> = { minnow: 80, bass: 17, salmon: 3, "coral-trout": 0, lobster: 0 };
export const FISH_WEIGHTS_BUBBLE: Record<FishKind, number> = { minnow: 25, bass: 45, salmon: 30, "coral-trout": 0, lobster: 0 };

export const CORAL_WEIGHTS: Record<FishKind, number> = {
  minnow: 0, bass: 0, salmon: 0,
  "coral-trout": 78,
  lobster:       22,
};

export function isCoralFish(kind: FishKind): boolean {
  return kind === "coral-trout" || kind === "lobster";
}

export function zeroFish(): Record<FishKind, number> {
  return { minnow: 0, bass: 0, salmon: 0, "coral-trout": 0, lobster: 0 };
}
