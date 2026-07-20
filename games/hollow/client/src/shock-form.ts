/**
 * `shock-form.ts` — PURE param-form <-> `Shock` mapping for the director's
 * perturbation buttons (chunk hollow-11b). Sane defaults per shock kind, so
 * a director can just press "Famine" and get a reasonable window without
 * touching any control — mirrors `persona-form.ts`'s split (pure mapping
 * here, `shock-panel.ts` is the DOM layer).
 *
 * `buildShock` NEVER mutates sim state itself — it only builds the `Shock`
 * payload `main.ts` posts as `{type:"shock", shock}` to the worker, which is
 * the ONLY thing allowed to call `sim.scheduleShock` (see
 * `worker/sim-worker.ts`'s header) — see CLAUDE.md's determinism rule.
 */
import { NEED_REST } from "@hollow/sim-core/economy";
import type { ResourceKind } from "@hollow/sim-core/world";
import type { Shock, ShockKind } from "@hollow/sim-core/protocols";

export const SHOCK_KINDS: readonly ShockKind[] = ["famine", "boom", "disaster", "plague"];

/** One param form covering every shock kind's fields — unused fields for the
 *  CURRENT `kind` are simply ignored by `buildShock`, so switching `kind` in
 *  the UI doesn't lose whatever the director already typed into the other
 *  fields. */
export interface ShockFormState {
  readonly kind: ShockKind;
  readonly resourceKind: ResourceKind;
  readonly factor: number;
  readonly durationTicks: number;
  readonly need: string;
  readonly amountPerTick: number;
}

/** Sane defaults for a fresh param form, defaulting to `"famine"`. */
export function defaultShockFormState(kind: ShockKind = "famine"): ShockFormState {
  return {
    kind,
    resourceKind: "food",
    factor: kind === "boom" ? 2 : 0.3,
    durationTicks: 120,
    need: NEED_REST,
    amountPerTick: 1,
  };
}

/** Builds the `Shock` payload for the CURRENT `form.kind` — pure, total (a
 *  switch over the closed `ShockKind` union, so TS flags a new kind that
 *  isn't handled here). */
export function buildShock(form: ShockFormState): Shock {
  switch (form.kind) {
    case "famine":
      return { kind: "famine", resourceKind: form.resourceKind, factor: form.factor, durationTicks: form.durationTicks };
    case "boom":
      return { kind: "boom", resourceKind: form.resourceKind, factor: form.factor, durationTicks: form.durationTicks };
    case "disaster":
      return { kind: "disaster", resourceKind: form.resourceKind };
    case "plague":
      return { kind: "plague", need: form.need, amountPerTick: form.amountPerTick, durationTicks: form.durationTicks };
  }
}
