// ── Atlas sheet grouping ──────────────────────────────────────────────────────
// Design decision: derive the sheet from the frame-name prefix via an explicit
// map so that an unknown prefix fails loudly at build time (rather than landing
// in a silent default bucket). Adding a new prefix requires updating this map.
//
// Sheets (≈5–7; keeps the split practical):
//   characters — farmer/* + npc/*
//   buildings  — structure/*
//   terrain    — tile/*
//   crops      — crop/*
//   props      — decoration/*
//   items-ui   — fish/* + tool/* + indicator/* + debug/*
export const PREFIX_TO_SHEET: Readonly<Record<string, string>> = {
  "farmer":     "characters",
  "npc":        "characters",
  "structure":  "buildings",
  "tile":       "terrain",
  "crop":       "crops",
  "decoration": "props",
  "fish":       "items-ui",
  "tool":       "items-ui",
  "indicator":  "items-ui",
  "debug":      "items-ui",
  // brief 42 — livestock + orchard
  "animal":     "characters",  // small animal sprites (chicken, cow, sheep)
  "product":    "items-ui",    // product icons (egg, milk, wool)
  "fruit":      "items-ui",    // fruit icons (apple, cherry)
};

/**
 * Derive the sheet id from a frame name (e.g. "farmer/conservative" → "characters").
 * Throws if the prefix is not registered in PREFIX_TO_SHEET so unknown frames
 * fail loudly at build time and at runtime.
 */
export function frameToSheetId(frame: string): string {
  const prefix = frame.split("/")[0];
  const sheet = PREFIX_TO_SHEET[prefix ?? ""];
  if (sheet === undefined) {
    throw new Error(`frameToSheetId: unknown prefix "${prefix ?? ""}" in frame "${frame}". Add it to PREFIX_TO_SHEET.`);
  }
  return sheet;
}

/** Resolved pixel width of a recipe (explicit `width`, else square `size`). */
export function recipeWidth(r: { size: number; width?: number }): number {
  return r.width ?? r.size;
}

/** Resolved pixel height of a recipe (explicit `height`, else square `size`). */
export function recipeHeight(r: { size: number; height?: number }): number {
  return r.height ?? r.size;
}
