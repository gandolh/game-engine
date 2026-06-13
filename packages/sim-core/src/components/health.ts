/** Combat hit points. KO at current<=0 (never death). Resets per the combat context (ring: bout end; street: day start). */
export interface Health {
  current: number;
  max: number;
}

/** Default HP pool. Tuned (with FIST_DAMAGE/BAT_DAMAGE in combat.ts) so a bout lasts a watchable handful of swings. */
export const HEALTH_MAX = 40;
