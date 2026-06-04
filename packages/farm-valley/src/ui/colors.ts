// Shared personality color palette — single source of truth for the observer
// panel, leaderboard, and any future UI that color-codes farmers by personality.
//
// The four personality kinds are conservative / aggressive / hoarder /
// opportunist (see Personality.kind in @engine/core). The legacy aliases
// (cautious / bold / social) are kept so any older snapshot or label still
// resolves to a stable color.

import { EDG } from "@engine/core/render";

export const PERSONALITY_COLORS: Record<string, string> = {
  conservative: EDG.skyBlue, // skyBlue
  aggressive: EDG.orange,    // orange
  hoarder: EDG.green,        // green
  opportunist: EDG.mauve,    // purple
  // legacy aliases
  cautious: EDG.skyBlue,
  bold: EDG.orange,
  social: EDG.green,
  default: EDG.mauve,
};

export function personalityColor(p: string): string {
  return PERSONALITY_COLORS[p.toLowerCase()] ?? PERSONALITY_COLORS["default"] ?? EDG.mauve;
}
