/**
 * The Hollow agent component — grid position + movement target. Everything
 * else BDI-shaped (fsm/beliefs/desires/intentions/personality/inbox) is the
 * engine's own generic component set (`@engine/core/ecs`); this is the one
 * piece of per-agent state that is genuinely Hollow's: where it sits on the
 * 64x64 grid and where it's currently walking to.
 *
 * `moveTarget` is nullable (not optional) rather than `MoveTarget | undefined`
 * so systems can clear it with a plain assignment (`agent.moveTarget = null`)
 * under `exactOptionalPropertyTypes` — an optional field would reject an
 * explicit `undefined` assignment unless the type spelled that out anyway.
 */

export interface MoveTarget {
  readonly gx: number;
  readonly gy: number;
}

export interface HollowAgent {
  gx: number;
  gy: number;
  moveTarget: MoveTarget | null;
  /**
   * RENDER-ONLY coarse action label for the CURRENT tick (chunk hollow-09a) —
   * e.g. "idle" | "walk" | "eat" | "work" | "rest" | a social-verb name
   * ("gift"/"share"/"help"/"teach"/"trade"/"steal"/"sabotage"/"rumor"/
   * "attack"). Written by `HollowPerceiveSystem` (reset to "idle" at the
   * START of every tick) and the ACT-stage systems (`systems/act.ts`,
   * `social/act-system.ts`), surfaced via `HollowAgentSnapshot.action` for
   * the client renderer to pose/glyph agents (chunk hollow-09b).
   *
   * DETERMINISM GUARD: this field must be WRITE-ONLY from the sim's point of
   * view — no deliberation, valuation, or RNG-gated logic may ever read it
   * (grepped and confirmed at hollow-09a time: only PERCEIVE/ACT-stage
   * systems assign it; nothing branches on it). Optional so pre-hollow-09a
   * hand-built test harnesses that construct a `HollowAgent` literal without
   * it still typecheck.
   */
  currentAction?: string;
  /**
   * The tick this agent last INITIATED a social verb (chunk hollow-14c-2's
   * per-agent cooldown) — written by `agents/villager.ts` the moment a
   * `chooseSocialAction` result is actually queued (whether or not the verb
   * ends up "consummating" its effect — see `HollowSnapshot.socialCounts`'s
   * doc on that distinction; cooldown gates on INITIATION, not outcome).
   * `undefined` means "never initiated one yet" and never blocks — see
   * `villager.ts`'s `offSocialCooldown`. Optional so pre-hollow-14c-2
   * hand-built test harnesses that construct a `HollowAgent` literal without
   * it still typecheck (same convention as `currentAction` above).
   */
  lastSocialActTick?: number;
  /**
   * The corpse entity id a `grave-digger` (components/occupation.ts) is
   * currently carrying to the graveyard (chunk hollow-15), or `null`/absent
   * when empty-handed. Written by the `collect_corpse`/`bury_corpse` care-acts
   * (`mortality/care-act-system.ts`) and read by the grave-digger routine
   * (`agents/villager.ts`) to decide "carry to graveyard" vs "find the next
   * body". Cleared (with the corpse's own `carriedBy`) if the digger dies
   * mid-carry — see `family/lifecycle-system.ts`'s `handleDeath`. Optional so
   * pre-hollow-15 hand-built harnesses still typecheck (same convention as
   * `lastSocialActTick`).
   */
  carryingCorpseId?: number | null;
  /**
   * A `medic`'s daily treatment budget bookkeeping (chunk hollow-15): the
   * count of patients treated on `medicTreatDay`. Reset lazily to 0 whenever
   * the current `dayPhase(...).dayOfRun` no longer matches `medicTreatDay`
   * (see the `treat` care-act) so a medic treats at most
   * `MEDIC_MAX_TREATMENTS_PER_DAY` (3) agents per in-game day. Pure tick
   * arithmetic, no `Rng`. Optional, same convention as above.
   */
  medicTreatsToday?: number;
  /** The `dayOfRun` (`world/day-cycle.ts`) `medicTreatsToday` was last counted
   *  against — a mismatch means a new day has begun and the budget resets. */
  medicTreatDay?: number;
}
