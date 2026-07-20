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
}
