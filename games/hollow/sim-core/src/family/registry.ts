/**
 * HouseholdRegistry — plain-data registry keyed by household id, mirroring
 * `community/registry.ts`'s `CommunityRegistry` (households are a small
 * managed set, not ECS entities — no FSM, no deliberation of their own). Id
 * assignment is a plain incrementing counter, same rationale as
 * `CommunityRegistry`'s header (a household id is a stable handle, never a
 * "genuine coin flip", so no `Rng` draw is needed here).
 */
import type { Household } from "./household";

export class HouseholdRegistry {
  private readonly byId = new Map<number, Household>();
  private nextId = 1;

  /** Forms a new household for `partnerA`/`partnerB` (order-independent —
   *  internally normalized so `partnerA < partnerB`, matching
   *  `family/pairbond-system.ts`'s ascending-id pairing). */
  form(partnerA: number, partnerB: number, tick: number): Household {
    const a = Math.min(partnerA, partnerB);
    const b = Math.max(partnerA, partnerB);
    const household: Household = {
      id: this.nextId++,
      partnerA: a,
      partnerB: b,
      memberIds: [a, b],
      sharedStock: {},
      formedTick: tick,
      lastBirthRollTick: tick,
      pregnancy: null,
    };
    this.byId.set(household.id, household);
    return household;
  }

  get(id: number): Household | undefined {
    return this.byId.get(id);
  }

  /** All households, sorted ascending by id — the only iteration order any
   *  caller should use (never `this.byId.values()` directly). */
  all(): Household[] {
    return [...this.byId.values()].sort((a, b) => a.id - b.id);
  }

  /** Inserts `agentId` into `memberIds`, keeping the array sorted ascending.
   *  No-op if already present or the household doesn't exist. */
  addMember(householdId: number, agentId: number): void {
    const h = this.byId.get(householdId);
    if (!h || h.memberIds.includes(agentId)) return;
    const idx = h.memberIds.findIndex((m) => m > agentId);
    if (idx === -1) h.memberIds.push(agentId);
    else h.memberIds.splice(idx, 0, agentId);
  }

  /** Removes `agentId` from `memberIds`. No-op if absent or the household
   *  doesn't exist. */
  removeMember(householdId: number, agentId: number): void {
    const h = this.byId.get(householdId);
    if (!h) return;
    const idx = h.memberIds.indexOf(agentId);
    if (idx !== -1) h.memberIds.splice(idx, 1);
  }

  /** Removes the household from the registry and returns the removed
   *  object (or `undefined` if it didn't exist) so the caller can decide
   *  what happens to its `sharedStock`/remaining members. */
  dissolve(householdId: number): Household | undefined {
    const h = this.byId.get(householdId);
    if (!h) return undefined;
    this.byId.delete(householdId);
    return h;
  }
}
