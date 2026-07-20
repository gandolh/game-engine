/**
 * `shock-panel.ts` — the director's environmental-shock DOM bar (chunk
 * hollow-11b): Famine/Boom/Disaster/Plague buttons, each backed by a small
 * param control (resource kind, magnitude/factor, window length, plague
 * need/rate) initialized to `shock-form.ts`'s sane per-kind defaults. Firing
 * a shock never mutates sim state directly — it only calls
 * `callbacks.onFireShock(shock)`, which `main.ts` wires to the worker's
 * `{type:"shock", shock}` message (the ONLY path that calls
 * `sim.scheduleShock`, see `worker/sim-worker.ts`'s header) — this module
 * has no worker access at all.
 *
 * Palette purity: every color is set via inline `style.color`/`background`
 * from a `HOLLOW_PAL.*` role, same idiom as `export-panel.ts`.
 */
import type { ResourceKind } from "@hollow/sim-core/world";
import type { ShockKind } from "@hollow/sim-core/protocols";
import { HOLLOW_PAL } from "./render/hollow-palette";
import { SHOCK_KINDS, defaultShockFormState, buildShock, type ShockFormState } from "./shock-form";

export interface ShockPanelCallbacks {
  onFireShock(shock: ReturnType<typeof buildShock>): void;
}

const SHOCK_LABEL: Readonly<Record<ShockKind, string>> = {
  famine: "Famine",
  boom: "Boom",
  disaster: "Disaster",
  plague: "Plague",
};

const RESOURCE_KINDS: readonly ResourceKind[] = ["food", "material"];

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Builds the (unattached) shock control bar. Starts on the first
 *  `SHOCK_KINDS` entry ("famine") with `defaultShockFormState`'s sane
 *  defaults. */
export function createShockPanel(callbacks: ShockPanelCallbacks): HTMLElement {
  let form: ShockFormState = defaultShockFormState();

  const root = el("div", "hollow-shock-panel");
  root.style.background = HOLLOW_PAL.ink;
  root.style.color = HOLLOW_PAL.cream;
  root.style.borderBottom = `2px solid ${HOLLOW_PAL.navy}`;

  const kindGroup = el("div", "hollow-shock-kind-group");
  const kindButtons = new Map<ShockKind, HTMLButtonElement>();

  const resourceRow = el("div", "hollow-shock-row");
  const resourceLabel = el("label", "hollow-shock-label", "resource");
  resourceLabel.style.color = HOLLOW_PAL.steel;
  const resourceSelect = document.createElement("select");
  for (const kind of RESOURCE_KINDS) {
    const opt = document.createElement("option");
    opt.value = kind;
    opt.textContent = kind;
    resourceSelect.appendChild(opt);
  }
  resourceSelect.value = form.resourceKind;
  resourceSelect.addEventListener("change", () => {
    form = { ...form, resourceKind: resourceSelect.value as ResourceKind };
  });
  resourceRow.appendChild(resourceLabel);
  resourceRow.appendChild(resourceSelect);

  const factorRow = el("div", "hollow-shock-row");
  const factorLabel = el("label", "hollow-shock-label", "factor");
  factorLabel.style.color = HOLLOW_PAL.steel;
  const factorInput = document.createElement("input");
  factorInput.type = "number";
  factorInput.step = "0.1";
  factorInput.min = "0";
  factorInput.value = String(form.factor);
  factorInput.addEventListener("change", () => {
    form = { ...form, factor: Number(factorInput.value) || 0 };
  });
  factorRow.appendChild(factorLabel);
  factorRow.appendChild(factorInput);

  const durationRow = el("div", "hollow-shock-row");
  const durationLabel = el("label", "hollow-shock-label", "duration (ticks)");
  durationLabel.style.color = HOLLOW_PAL.steel;
  const durationInput = document.createElement("input");
  durationInput.type = "number";
  durationInput.min = "1";
  durationInput.value = String(form.durationTicks);
  durationInput.addEventListener("change", () => {
    form = { ...form, durationTicks: Number(durationInput.value) || 1 };
  });
  durationRow.appendChild(durationLabel);
  durationRow.appendChild(durationInput);

  const needRow = el("div", "hollow-shock-row");
  const needLabel = el("label", "hollow-shock-label", "need (plague)");
  needLabel.style.color = HOLLOW_PAL.steel;
  const needInput = document.createElement("input");
  needInput.type = "text";
  needInput.value = form.need;
  needInput.addEventListener("change", () => {
    form = { ...form, need: needInput.value };
  });
  needRow.appendChild(needLabel);
  needRow.appendChild(needInput);

  const amountRow = el("div", "hollow-shock-row");
  const amountLabel = el("label", "hollow-shock-label", "amount/tick (plague)");
  amountLabel.style.color = HOLLOW_PAL.steel;
  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.step = "0.1";
  amountInput.value = String(form.amountPerTick);
  amountInput.addEventListener("change", () => {
    form = { ...form, amountPerTick: Number(amountInput.value) || 0 };
  });
  amountRow.appendChild(amountLabel);
  amountRow.appendChild(amountInput);

  function paintKind(): void {
    for (const [kind, btn] of kindButtons) {
      const active = kind === form.kind;
      btn.style.color = active ? HOLLOW_PAL.ink : HOLLOW_PAL.steel;
      btn.style.background = active ? HOLLOW_PAL.rust : HOLLOW_PAL.navy;
      btn.setAttribute("aria-pressed", String(active));
    }
    // Disaster has no window/magnitude — plague uses need/amount instead of
    // factor; keep every control visible/editable regardless (simpler,
    // documented in shock-form.ts's header: unused fields for the current
    // kind are just ignored by `buildShock`), only hide plague-only rows for
    // non-plague kinds and factor/duration for disaster, to reduce clutter.
    factorRow.style.display = form.kind === "disaster" ? "none" : "";
    durationRow.style.display = form.kind === "disaster" ? "none" : "";
    needRow.style.display = form.kind === "plague" ? "" : "none";
    amountRow.style.display = form.kind === "plague" ? "" : "none";
  }

  for (const kind of SHOCK_KINDS) {
    const btn = el("button", "hollow-shock-kind-button", SHOCK_LABEL[kind]) as HTMLButtonElement;
    btn.type = "button";
    btn.addEventListener("click", () => {
      form = defaultShockFormState(kind);
      resourceSelect.value = form.resourceKind;
      factorInput.value = String(form.factor);
      durationInput.value = String(form.durationTicks);
      needInput.value = form.need;
      amountInput.value = String(form.amountPerTick);
      paintKind();
    });
    kindButtons.set(kind, btn);
    kindGroup.appendChild(btn);
  }
  paintKind();

  const fireBtn = el("button", "hollow-shock-fire-button", "Fire shock") as HTMLButtonElement;
  fireBtn.type = "button";
  fireBtn.style.color = HOLLOW_PAL.ink;
  fireBtn.style.background = HOLLOW_PAL.red;
  fireBtn.addEventListener("click", () => {
    callbacks.onFireShock(buildShock(form));
  });

  root.appendChild(kindGroup);
  root.appendChild(resourceRow);
  root.appendChild(factorRow);
  root.appendChild(durationRow);
  root.appendChild(needRow);
  root.appendChild(amountRow);
  root.appendChild(fireBtn);

  return root;
}
