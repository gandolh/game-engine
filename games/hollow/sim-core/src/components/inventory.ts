/**
 * Inventory — a bag of named goods counts an agent (or, later, any owning
 * entity) carries. Deliberately generic (`Record<string, number>`, not a
 * closed union of good kinds) because hollow-06 (trade) and hollow-04
 * (shared/communal stores) will add goods kinds this brief has no reason to
 * anticipate. `economy/constants.ts` names the two kinds hollow-03 actually
 * produces (`GOOD_FOOD`, `GOOD_MATERIALS`).
 */

export interface Inventory {
  goods: Record<string, number>;
}

export function makeInventory(): Inventory {
  return { goods: {} };
}

/** Adds `amount` (>= 0) of `kind` to the inventory. Mutates `inv`. */
export function addGoods(inv: Inventory, kind: string, amount: number): void {
  if (amount <= 0) return;
  inv.goods[kind] = (inv.goods[kind] ?? 0) + amount;
}

/**
 * Removes up to `amount` of `kind` from the inventory (never goes negative)
 * and returns how much was actually taken. Mutates `inv`.
 */
export function takeGoods(inv: Inventory, kind: string, amount: number): number {
  const have = inv.goods[kind] ?? 0;
  const taken = Math.min(have, amount);
  inv.goods[kind] = have - taken;
  return taken;
}
