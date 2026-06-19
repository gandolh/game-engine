

export const FIST_DAMAGE = { lo: 4, hi: 9 } as const;

export const BAT_DAMAGE = { lo: 8, hi: 15 } as const;

export const AP_PER_SWING = { fist: 2, bat: 3 } as const;

export function swingIntervalTicks(ticksPerDay: number): number {
  return Math.max(1, Math.round(ticksPerDay / 50));
}

export const RING_STAKE_GOLD = 10;

export const RING_TRUST_BOND = 0.1;

export const STREET_ATTACK_TRUST_PENALTY = -0.08;

export const STREET_LOOT_TRUST_PENALTY = -0.12;

export const MAX_LOOT_UNITS = 3;

export const FIGHT_COOLDOWN_DAYS = 2;

export const DAILY_FIGHT_CAP = 2;

export function pursuitWindowTicks(ticksPerDay: number): number {
  return Math.max(2, Math.round(ticksPerDay / 2));
}

export const STREET_FLEE_CHANCE = 0.04;
