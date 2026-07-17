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
}
