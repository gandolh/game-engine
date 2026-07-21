/**
 * Corpse — a dead villager's body left in the world (chunk hollow-15). Unlike
 * every other Hollow component, a `Corpse` lives on its OWN entity
 * (`{ id, corpse }`, spawned by `family/lifecycle-system.ts`'s `handleDeath`),
 * NOT on a living agent: it carries no `agent`/`needs`/`beliefs`, so every
 * existing agent system's `world.query(...)` (which all name at least `agent`
 * or `needs`) keeps seeing ONLY the living — a corpse is invisible to
 * deliberation, decay, trust, governance, etc. Corpse-aware systems query the
 * distinct `world.query("corpse")` set instead.
 *
 * Lifecycle of a corpse (see `mortality/corpse-system.ts` + the grave-digger
 * routine in `agents/villager.ts`):
 *   spawned at the death tile → (rot delay elapses unburied) `rotting` → a
 *   rotting body infects nearby living agents → a grave-digger `collect`s it
 *   (`carriedBy` set; the body then follows the digger's tile) → carried to
 *   `GRAVEYARD_TILE` and `bury`d (entity despawned, `buriedCount++`).
 *
 * `gx`/`gy` are MUTABLE (a carried corpse tracks its carrier's tile) — the one
 * per-corpse piece of grid state, mirroring `HollowAgent`'s own `gx`/`gy`.
 * Nothing here draws any `Rng`.
 */
export interface Corpse {
  /** The (now-despawned) agent this body belonged to — for chronicle/render
   *  and lineage lookup. */
  readonly deceasedId: number;
  /** Tick of death — the rot clock's origin (see `CORPSE_ROT_DELAY_*`). */
  readonly diedTick: number;
  /** Current grid tile. Mutable: a carried corpse follows its carrier. */
  gx: number;
  gy: number;
  /** Set true the tick a grave-digger deposits it at the graveyard — the
   *  terminal state right before the corpse entity is despawned. */
  buried: boolean;
  /** Set true once the body has lain unburied past the rot delay — a rotting,
   *  un-carried body is what actually spreads disease. */
  rotting: boolean;
  /** The grave-digger agent id currently carrying this body, or `null` if it
   *  lies where it fell. A carried body neither spreads disease nor is a
   *  valid `collect` target for another digger. */
  carriedBy: number | null;
}

/** A fresh corpse at the death tile — unburied, not yet rotting, uncarried. */
export function makeCorpse(deceasedId: number, diedTick: number, gx: number, gy: number): Corpse {
  return { deceasedId, diedTick, gx, gy, buried: false, rotting: false, carriedBy: null };
}
