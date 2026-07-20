/**
 * `persona-setup-panel.ts` — the director's pre-run authoring screen (chunk
 * hollow-11b): a full-viewport DOM overlay that builds a `PersonaSeed`
 * (`persona-form.ts`'s pure `buildPersonaSeed`) and hands it to `main.ts` on
 * "Start". Mounted BEFORE the worker is initialized/3D app is booted (see
 * `main.ts`'s boot flow) — nothing here reaches into the sim/worker; it only
 * ever calls `callbacks.onStart(seed)` once, with the fully-built
 * `PersonaSeed`.
 *
 * DOM wiring is intentionally thin: every field write goes through
 * `persona-form.ts`'s pure `with*` helpers, and the row/appearance/gene
 * loops are DATA-DRIVEN off `BEHAVIOR_GENES`/`APTITUDE_SKILLS`/
 * `SKIN_TONE_ROLES`/`HAIR_TONE_ROLES` (not hand-repeated per gene) so this
 * file stays a thin renderer over already-tested pure logic.
 *
 * Palette purity: every color is set via inline `style.color`/`background`
 * from a `HOLLOW_PAL.*` role, same idiom as `inspect-panel.ts`.
 */
import {
  BEHAVIOR_GENES,
  APTITUDE_SKILLS,
  GENE_MIN,
  GENE_MAX,
  APPEARANCE_HEIGHT_MIN,
  APPEARANCE_HEIGHT_MAX,
  APPEARANCE_BUILD_MIN,
  APPEARANCE_BUILD_MAX,
  SKIN_TONE_ROLES,
  HAIR_TONE_ROLES,
  type BehaviorGene,
  type AptitudeSkill,
  type SkinToneRole,
  type HairToneRole,
} from "@hollow/sim-core/components";
import { ARCHETYPE_PRESETS, type PersonaSeed } from "@hollow/sim-core/persona";
import { HOLLOW_PAL } from "./render/hollow-palette";
import {
  defaultPersonaFormState,
  withSeed,
  withRow,
  withCount,
  withLockToggled,
  withBehaviorValue,
  withAptitudeValue,
  withAppearanceNumber,
  withAppearanceTone,
  randomizeUnlocked,
  buildPersonaSeed,
  type PersonaFormState,
  type ArchetypeRowState,
} from "./persona-form";

export interface PersonaSetupCallbacks {
  /** Fired exactly once, when the director presses "Start" — `seed` is the
   *  fully-built `PersonaSeed` (`buildPersonaSeed(state)`). */
  onStart(seed: PersonaSeed): void;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function numberInput(value: number, min: number, max: number, step: number, onChange: (n: number) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => onChange(Number(input.value)));
  return input;
}

function optionalNumberInput(value: number | undefined, placeholder: string, onChange: (n: number | undefined) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.placeholder = placeholder;
  if (value !== undefined) input.value = String(value);
  input.addEventListener("change", () => {
    onChange(input.value === "" ? undefined : Number(input.value));
  });
  return input;
}

/** Builds the (unattached), full-viewport authoring overlay. */
export function renderPersonaSetupPanel(callbacks: PersonaSetupCallbacks): HTMLElement {
  let state: PersonaFormState = defaultPersonaFormState();

  const root = el("div", "hollow-setup-panel");
  root.style.background = HOLLOW_PAL.ink;
  root.style.color = HOLLOW_PAL.cream;

  const title = el("h1", "hollow-setup-title", "Found the Hollow");
  title.style.color = HOLLOW_PAL.gold;
  root.appendChild(title);

  const subtitle = el(
    "p",
    "hollow-setup-subtitle",
    "Choose your founders' archetypes, fine-tune their genes, set a seed, then start the town.",
  );
  subtitle.style.color = HOLLOW_PAL.steel;
  root.appendChild(subtitle);

  // --- seed ------------------------------------------------------------------
  const seedRow = el("div", "hollow-setup-row");
  const seedLabel = el("label", "hollow-setup-label", "Seed");
  seedLabel.style.color = HOLLOW_PAL.silver;
  const seedInput = document.createElement("input");
  seedInput.type = "number";
  seedInput.value = String(state.seed);
  seedInput.addEventListener("change", () => {
    state = withSeed(state, Number(seedInput.value) || 0);
  });
  seedRow.appendChild(seedLabel);
  seedRow.appendChild(seedInput);
  root.appendChild(seedRow);

  // --- resource density --------------------------------------------------
  const densitySection = el("div", "hollow-setup-section");
  const densityTitle = el("h3", "hollow-setup-section-title", "Resource density (blank = default)");
  densityTitle.style.color = HOLLOW_PAL.silver;
  densitySection.appendChild(densityTitle);

  const densityFields: { key: keyof PersonaFormState; label: string }[] = [
    { key: "foodNodeCount", label: "food nodes" },
    { key: "foodNodeMaxStock", label: "food max stock" },
    { key: "foodNodeRegenPerTick", label: "food regen/tick" },
    { key: "materialNodeCount", label: "material nodes" },
    { key: "materialNodeMaxStock", label: "material max stock" },
    { key: "materialNodeRegenPerTick", label: "material regen/tick" },
  ];
  for (const field of densityFields) {
    const row = el("div", "hollow-setup-row");
    const label = el("label", "hollow-setup-label", field.label);
    label.style.color = HOLLOW_PAL.silver;
    const input = optionalNumberInput(state[field.key] as number | undefined, "default", (n) => {
      state = { ...state, [field.key]: n };
    });
    row.appendChild(label);
    row.appendChild(input);
    densitySection.appendChild(row);
  }
  root.appendChild(densitySection);

  // --- archetype rows ------------------------------------------------------
  const archetypesSection = el("div", "hollow-setup-section");
  const archetypesTitle = el("h3", "hollow-setup-section-title", "Founders");
  archetypesTitle.style.color = HOLLOW_PAL.silver;
  archetypesSection.appendChild(archetypesTitle);

  state.archetypes.forEach((row, index) => {
    archetypesSection.appendChild(renderArchetypeRow(row, index));
  });
  root.appendChild(archetypesSection);

  function renderArchetypeRow(initialRow: ArchetypeRowState, index: number): HTMLElement {
    const preset = ARCHETYPE_PRESETS[initialRow.preset];
    const rowEl = el("div", "hollow-setup-archetype-row");
    rowEl.style.borderTop = `1px solid ${HOLLOW_PAL.navy}`;

    const header = el("div", "hollow-setup-archetype-header");
    const label = el("span", "hollow-setup-archetype-label", preset?.label ?? initialRow.preset);
    label.style.color = HOLLOW_PAL.cream;

    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.min = "0";
    countInput.value = String(initialRow.count);
    countInput.addEventListener("change", () => {
      const row = state.archetypes[index]!;
      state = withRow(state, index, withCount(row, Number(countInput.value) || 0));
    });

    const tuneBtn = el("button", "hollow-setup-tune-btn", "Tune genes ▾") as HTMLButtonElement;
    tuneBtn.type = "button";
    tuneBtn.style.color = HOLLOW_PAL.cream;
    tuneBtn.style.background = HOLLOW_PAL.slate;

    const randomizeBtn = el("button", "hollow-setup-randomize-btn", "Randomize unlocked") as HTMLButtonElement;
    randomizeBtn.type = "button";
    randomizeBtn.style.color = HOLLOW_PAL.cream;
    randomizeBtn.style.background = HOLLOW_PAL.mauve;

    header.appendChild(label);
    header.appendChild(countInput);
    header.appendChild(tuneBtn);
    header.appendChild(randomizeBtn);
    rowEl.appendChild(header);

    const genePanel = el("div", "hollow-setup-gene-panel");
    genePanel.style.display = "none";
    rowEl.appendChild(genePanel);

    let sliderRefresh: (() => void) | null = null;

    tuneBtn.addEventListener("click", () => {
      const opening = genePanel.style.display === "none";
      genePanel.style.display = opening ? "block" : "none";
      tuneBtn.textContent = opening ? "Tune genes ▴" : "Tune genes ▾";
      if (opening && genePanel.childNodes.length === 0) {
        sliderRefresh = buildGenePanel(genePanel, index);
      }
    });

    randomizeBtn.addEventListener("click", () => {
      const row = state.archetypes[index]!;
      state = withRow(state, index, randomizeUnlocked(row));
      sliderRefresh?.();
    });

    return rowEl;
  }

  /** Builds the (data-driven) gene-slider fieldset for row `index` — one
   *  slider + lock checkbox per `BEHAVIOR_GENES`/`APTITUDE_SKILLS` entry,
   *  plus height/build sliders and skinTone/hairTone selects, each with its
   *  own lock checkbox. Returns a `refresh()` callback that re-reads all
   *  control values from the CURRENT `state` (used after "Randomize"). */
  function buildGenePanel(container: HTMLElement, index: number): () => void {
    const refreshers: (() => void)[] = [];

    function geneRow(
      geneLabel: string,
      geneKey: string,
      read: (row: ArchetypeRowState) => number | undefined,
      write: (row: ArchetypeRowState, value: number) => ArchetypeRowState,
      min: number,
      max: number,
      step: number,
    ): HTMLElement {
      const row = el("div", "hollow-setup-gene-row");
      const label = el("span", "hollow-setup-gene-label", geneLabel);
      label.style.color = HOLLOW_PAL.silver;

      const currentValue = () => read(state.archetypes[index]!) ?? (min + max) / 2;
      const valueLabel = el("span", "hollow-setup-gene-value", fmt(currentValue()));
      valueLabel.style.color = HOLLOW_PAL.cream;

      const slider = numberInput(currentValue(), min, max, step, (n) => {
        const current = state.archetypes[index]!;
        state = withRow(state, index, write(current, n));
        valueLabel.textContent = fmt(n);
      });

      const lockLabel = document.createElement("label");
      lockLabel.className = "hollow-setup-lock-label";
      const lockCheckbox = document.createElement("input");
      lockCheckbox.type = "checkbox";
      lockCheckbox.checked = state.archetypes[index]!.lock.includes(geneKey);
      lockCheckbox.addEventListener("change", () => {
        const current = state.archetypes[index]!;
        state = withRow(state, index, withLockToggled(current, geneKey));
      });
      lockLabel.appendChild(lockCheckbox);
      lockLabel.appendChild(document.createTextNode(" lock"));

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueLabel);
      row.appendChild(lockLabel);

      refreshers.push(() => {
        const v = currentValue();
        slider.value = String(v);
        valueLabel.textContent = fmt(v);
        lockCheckbox.checked = state.archetypes[index]!.lock.includes(geneKey);
      });
      return row;
    }

    function toneRow(
      geneLabel: string,
      geneKey: string,
      roles: readonly (SkinToneRole | HairToneRole)[],
      read: (row: ArchetypeRowState) => string | undefined,
      write: (row: ArchetypeRowState, value: SkinToneRole | HairToneRole) => ArchetypeRowState,
    ): HTMLElement {
      const row = el("div", "hollow-setup-gene-row");
      const label = el("span", "hollow-setup-gene-label", geneLabel);
      label.style.color = HOLLOW_PAL.silver;

      const select = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "(random)";
      select.appendChild(blank);
      for (const role of roles) {
        const opt = document.createElement("option");
        opt.value = role;
        opt.textContent = role;
        select.appendChild(opt);
      }
      select.value = read(state.archetypes[index]!) ?? "";
      select.addEventListener("change", () => {
        if (select.value === "") return; // no un-set-to-random control needed for v1 — locking it is the intended override path
        const current = state.archetypes[index]!;
        state = withRow(state, index, write(current, select.value as SkinToneRole | HairToneRole));
      });

      const lockLabel = document.createElement("label");
      lockLabel.className = "hollow-setup-lock-label";
      const lockCheckbox = document.createElement("input");
      lockCheckbox.type = "checkbox";
      lockCheckbox.checked = state.archetypes[index]!.lock.includes(geneKey);
      lockCheckbox.addEventListener("change", () => {
        const current = state.archetypes[index]!;
        state = withRow(state, index, withLockToggled(current, geneKey));
      });
      lockLabel.appendChild(lockCheckbox);
      lockLabel.appendChild(document.createTextNode(" lock"));

      row.appendChild(label);
      row.appendChild(select);
      row.appendChild(lockLabel);

      refreshers.push(() => {
        select.value = read(state.archetypes[index]!) ?? "";
        lockCheckbox.checked = state.archetypes[index]!.lock.includes(geneKey);
      });
      return row;
    }

    for (const gene of BEHAVIOR_GENES as readonly BehaviorGene[]) {
      container.appendChild(
        geneRow(
          gene,
          gene,
          (row) => row.behavior[gene],
          (row, v) => withBehaviorValue(row, gene, v),
          GENE_MIN,
          GENE_MAX,
          0.01,
        ),
      );
    }
    for (const skill of APTITUDE_SKILLS as readonly AptitudeSkill[]) {
      container.appendChild(
        geneRow(
          `${skill} aptitude`,
          skill,
          (row) => row.aptitude[skill],
          (row, v) => withAptitudeValue(row, skill, v),
          GENE_MIN,
          GENE_MAX,
          0.01,
        ),
      );
    }
    container.appendChild(
      geneRow(
        "height",
        "height",
        (row) => row.appearance.height,
        (row, v) => withAppearanceNumber(row, "height", v),
        APPEARANCE_HEIGHT_MIN,
        APPEARANCE_HEIGHT_MAX,
        0.01,
      ),
    );
    container.appendChild(
      geneRow(
        "build",
        "build",
        (row) => row.appearance.build,
        (row, v) => withAppearanceNumber(row, "build", v),
        APPEARANCE_BUILD_MIN,
        APPEARANCE_BUILD_MAX,
        0.01,
      ),
    );
    container.appendChild(
      toneRow(
        "skin tone",
        "skinTone",
        SKIN_TONE_ROLES,
        (row) => row.appearance.skinTone,
        (row, v) => withAppearanceTone(row, "skinTone", v as SkinToneRole),
      ),
    );
    container.appendChild(
      toneRow(
        "hair tone",
        "hairTone",
        HAIR_TONE_ROLES,
        (row) => row.appearance.hairTone,
        (row, v) => withAppearanceTone(row, "hairTone", v as HairToneRole),
      ),
    );

    return () => {
      for (const refresh of refreshers) refresh();
    };
  }

  // --- start button ----------------------------------------------------------
  const startBtn = el("button", "hollow-setup-start-btn", "Start") as HTMLButtonElement;
  startBtn.type = "button";
  startBtn.style.color = HOLLOW_PAL.ink;
  startBtn.style.background = HOLLOW_PAL.gold;
  startBtn.addEventListener("click", () => {
    callbacks.onStart(buildPersonaSeed(state));
  });
  root.appendChild(startBtn);

  return root;
}
