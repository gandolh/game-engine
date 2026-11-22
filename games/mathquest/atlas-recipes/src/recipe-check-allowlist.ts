/**
 * MateQuest's frames that break a recipe check on purpose (corpus brief 11's checks), each with its reason.
 * Empty: the ported creatures pass every check.
 */
export const RECIPE_CHECK_ALLOWLIST: readonly {
  frame: string;
  rule: "lone-pixel" | "corners" | "floor-row" | "height";
  reason: string;
}[] = [];
