// Shared personality color palette — single source of truth for the observer
// panel, leaderboard, and any future UI that color-codes farmers by personality.
//
// The four personality kinds are conservative / aggressive / hoarder /
// opportunist (see Personality.kind in @engine/core). The legacy aliases
// (cautious / bold / social) are kept so any older snapshot or label still
// resolves to a stable color.

export const PERSONALITY_COLORS: Record<string, string> = {
  conservative: "#4a90d9", // blue
  aggressive: "#e67e22",   // orange
  hoarder: "#2ecc71",      // green
  opportunist: "#9b59b6",  // purple
  // legacy aliases
  cautious: "#4a90d9",
  bold: "#e67e22",
  social: "#2ecc71",
  default: "#9b59b6",
};

export function personalityColor(p: string): string {
  return PERSONALITY_COLORS[p.toLowerCase()] ?? PERSONALITY_COLORS["default"] ?? "#9b59b6";
}
