/**
 * Farm's frames that break a recipe check on purpose (corpus brief 11), each with its reason. The checks are
 * in `tools/atlas-builder/src/recipe-checks.ts`; `set/*` covers every frame of a set. "To review" marks a
 * finding whose reason isn't clear yet: a later brief judges those by eye. Nothing here changes a pixel.
 */
export const RECIPE_CHECK_ALLOWLIST = [
  // lone-pixel: single pixels drawn on purpose.
  { frame: "structure/big-tree-bare", rule: "lone-pixel", reason: "snowflakes around the winter tree" },
  { frame: "structure/big-tree-autumn", rule: "lone-pixel", reason: "falling leaves under the autumn canopy" },
  { frame: "decoration/duck-b", rule: "lone-pixel", reason: "the last dash of the ripple under the swimming duck" },
  {
    frame: "structure/weather-beacon-b",
    rule: "lone-pixel",
    reason: "the beacon's blink frame is its lamp alone, drawn over the beacon",
  },

  // corners: frames drawn edge to edge.
  { frame: "indicator/hpbar-bg", rule: "corners", reason: "the health bar's background fills its frame" },
  { frame: "structure/dock", rule: "corners", reason: "to review: a dock piece drawn edge to edge, like a tile" },
  { frame: "structure/cargo-ship", rule: "corners", reason: "to review: the ship fills its frame to the corners" },

  // floor-row and height: sets that are catalogues of different things, not one subject's frames.
  { frame: "structure/*", rule: "floor-row", reason: "a catalogue of different buildings and objects" },
  { frame: "structure/*", rule: "height", reason: "a catalogue of different buildings and objects" },
  { frame: "decoration/*", rule: "floor-row", reason: "a catalogue of different decorations" },
  { frame: "decoration/*", rule: "height", reason: "a catalogue of different decorations" },
  { frame: "indicator/*", rule: "floor-row", reason: "different icons and bars, each placed on its own" },
  { frame: "indicator/*", rule: "height", reason: "different icons and bars, each placed on its own" },
  { frame: "tool/*", rule: "floor-row", reason: "different tools, drawn as hotbar icons" },
  { frame: "tool/*", rule: "height", reason: "different tools, drawn as hotbar icons" },
  { frame: "fish/*", rule: "floor-row", reason: "different fish species" },
  { frame: "fish/*", rule: "height", reason: "different fish species" },
  { frame: "product/*", rule: "floor-row", reason: "different products" },
  { frame: "product/*", rule: "height", reason: "different products" },
  { frame: "fruit/*", rule: "floor-row", reason: "different fruits" },
  { frame: "fruit/*", rule: "height", reason: "different fruits" },
  {
    frame: "farmer/opportunist",
    rule: "height",
    reason: "the five farmers' base frames are different people; the opportunist's hat is taller",
  },

  // floor-row and height: crop growth stages grow from seed to ripe, so heights and floors change.
  ...["carrot", "corn", "grape", "pumpkin", "radish", "tomato", "wheat", "winter-squash"].flatMap((crop) => [
    { frame: `crop/${crop}/*`, rule: "floor-row", reason: "growth stages, from seed to ripe" } as const,
    { frame: `crop/${crop}/*`, rule: "height", reason: "growth stages, from seed to ripe" } as const,
  ]),
] as const;
