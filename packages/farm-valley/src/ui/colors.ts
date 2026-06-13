

import { EDG } from "@engine/core/render";

export const PERSONALITY_COLORS: Record<string, string> = {
  conservative: EDG.skyBlue,
  aggressive: EDG.orange,
  hoarder: EDG.green,
  opportunist: EDG.mauve,

  cautious: EDG.skyBlue,
  bold: EDG.orange,
  social: EDG.green,
  default: EDG.mauve,
};

export function personalityColor(p: string): string {
  return PERSONALITY_COLORS[p.toLowerCase()] ?? PERSONALITY_COLORS["default"] ?? EDG.mauve;
}
