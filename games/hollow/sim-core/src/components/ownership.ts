/**
 * Ownership — a marker recording which agent entity a piece of state (today:
 * an agent's own `Inventory`) belongs to. In hollow-03 every agent
 * self-owns its inventory (`ownerId === own id`); there is no transfer yet
 * (that's hollow-06's trade verb) and no shared/communal property (hollow-04).
 * The component exists now so those briefs have a seam — an explicit owner
 * reference — rather than needing to retrofit one onto existing inventories.
 */

export interface Ownership {
  ownerId: number;
}
