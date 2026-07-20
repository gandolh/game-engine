/**
 * Shock ontology — chunk hollow-11a's deterministic environmental
 * interventions (famine/boom/disaster/plague), mirroring protocols/family.ts's
 * ONT_* + body-shape pattern. The `Shock` union + `Intervention` record live
 * HERE (not a separate `shock/types.ts`) since they're small and this IS
 * their documented home per the brief. The class that actually schedules/
 * applies/replays them (`HollowShockSystem`) lives in `../shock/system.ts` —
 * a sibling of `community/`, `family/`'s own system-package layout — and
 * imports these types from here; this file only defines the wire format.
 */
import type { ResourceKind } from "../world";

export type ShockKind = "famine" | "boom" | "disaster" | "plague";

/** Multiplies a resource kind's regen rate by `factor` (< 1) for
 *  `[applyTick, applyTick + durationTicks)` — see `ResourceWorld.setRegenMultiplier`. */
export interface FamineShock {
  readonly kind: "famine";
  readonly resourceKind: ResourceKind;
  readonly factor: number;
  readonly durationTicks: number;
}

/** Same mechanism as `FamineShock`, `factor` (> 1) — an abundance window. */
export interface BoomShock {
  readonly kind: "boom";
  readonly resourceKind: ResourceKind;
  readonly factor: number;
  readonly durationTicks: number;
}

/** One-shot: zeros the stock of ONE node of `resourceKind`, chosen by a
 *  fork keyed to the intervention's own (tick, seq) — see
 *  `shock/system.ts`'s `applyDisaster`. No window (applies once, at the
 *  scheduled tick, and never reverts). */
export interface DisasterShock {
  readonly kind: "disaster";
  readonly resourceKind: ResourceKind;
}

/** Drains `amountPerTick` from every living agent's `need` (a `Needs.byKind`
 *  key — e.g. `NEED_REST`, economy/constants.ts) every tick for
 *  `[applyTick, applyTick + durationTicks)`. */
export interface PlagueShock {
  readonly kind: "plague";
  readonly need: string;
  readonly amountPerTick: number;
  readonly durationTicks: number;
}

export type Shock = FamineShock | BoomShock | DisasterShock | PlagueShock;

/**
 * One scheduled (and, once its `tick` arrives, applied) shock — the
 * replayable unit exposed as `BootedHollowSim.interventionLog`. `seq` is a
 * monotonic SCHEDULING-order counter (not the tick) that gives same-tick
 * shocks a stable, distinct sub-key for any randomized specifics (a
 * disaster's victim-node pick) — see `shock/system.ts`'s header for the
 * exact fork-keying scheme.
 */
export interface Intervention {
  readonly seq: number;
  readonly tick: number;
  readonly shock: Shock;
}

export const ONT_SHOCK = {
  FAMINE: "shock.famine",
  BOOM: "shock.boom",
  DISASTER: "shock.disaster",
  PLAGUE: "shock.plague",
} as const;

export type ShockOntology = (typeof ONT_SHOCK)[keyof typeof ONT_SHOCK];

/** Message body for every `ONT_SHOCK.*` broadcast — mirrors the applied
 *  `Intervention` (minus the wrapper) so a chronicle/GUI subscriber can
 *  replay exactly what happened without re-deriving it. */
export interface ShockAppliedBody {
  readonly tick: number;
  readonly seq: number;
  readonly shock: Shock;
}

/** `Shock.kind` -> its `ONT_SHOCK` value — a small explicit switch (not a
 *  string-case transform) so renaming a `ShockKind` literal can't silently
 *  desync it from its ontology string. */
export function shockOntology(kind: ShockKind): ShockOntology {
  switch (kind) {
    case "famine":
      return ONT_SHOCK.FAMINE;
    case "boom":
      return ONT_SHOCK.BOOM;
    case "disaster":
      return ONT_SHOCK.DISASTER;
    case "plague":
      return ONT_SHOCK.PLAGUE;
  }
}
