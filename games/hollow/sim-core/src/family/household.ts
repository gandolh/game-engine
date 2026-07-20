/**
 * Household — a pair-bonded partnership + shared resource pool (chunk
 * hollow-05). Mirrors `community/community.ts`'s plain-data shape: not an
 * ECS entity (no FSM/deliberation of its own), owned by `HouseholdRegistry`
 * (family/registry.ts), referenced from each member's `householdId`.
 *
 * `lastBirthRollTick`/`pregnancy` are additive bookkeeping beyond the
 * brief's minimal `{id, partnerA, partnerB, memberIds, sharedStock}` shape
 * — kept ON the household (not a side map) so `HollowReproductionSystem`
 * needs no extra registry to track per-household conception cadence /
 * in-progress gestation.
 */
export interface Household {
  readonly id: number;
  partnerA: number;
  partnerB: number;
  /** Both partners plus any co-resident children, sorted ascending. */
  memberIds: number[];
  sharedStock: Record<string, number>;
  readonly formedTick: number;
  /** Tick of this household's last birth-window roll (chunk hollow-05's
   *  periodic conception check, family/constants.ts's BIRTH_WINDOW_TICKS). */
  lastBirthRollTick: number;
  /** An in-progress pregnancy (gestation delay between a successful
   *  conception roll and the child actually spawning), or `null`. */
  pregnancy: { readonly dueTick: number } | null;
}
