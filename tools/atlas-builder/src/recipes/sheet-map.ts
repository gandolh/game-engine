
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
  "animal":     "characters",
  "product":    "items-ui",
  "fruit":      "items-ui",
};

export function frameToSheetId(frame: string): string {
  const prefix = frame.split("/")[0];
  const sheet = PREFIX_TO_SHEET[prefix ?? ""];
  if (sheet === undefined) {
    throw new Error(`frameToSheetId: unknown prefix "${prefix ?? ""}" in frame "${frame}". Add it to PREFIX_TO_SHEET.`);
  }
  return sheet;
}

export function recipeWidth(r: { size: number; width?: number }): number {
  return r.width ?? r.size;
}

export function recipeHeight(r: { size: number; height?: number }): number {
  return r.height ?? r.size;
}
