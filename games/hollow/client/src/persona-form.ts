/**
 * `persona-form.ts` — PURE form-state <-> `PersonaSeed` mapping for the
 * director's pre-run authoring screen (chunk hollow-11b). No DOM here —
 * `persona-setup-panel.ts` is the DOM layer that reads/writes this state
 * (mirrors `chronicle-format.ts`'s split from `chronicle-panel.ts`).
 *
 * `ArchetypeRowState` mirrors `@hollow/sim-core/persona`'s `ArchetypeEntry`/
 * `GeneOverrides` shape directly (`behavior`/`aptitude`/`appearance`/`lock`)
 * so `buildPersonaSeed` is close to a 1:1 field copy — every gene slider
 * writes into the SAME field `applyPersonaSeed` (hollow-11a, sim-core) reads
 * as an override; a gene never touched by the director stays `undefined` and
 * rolls from the archetype preset's own template + variance, exactly as
 * hollow-11a documents.
 *
 * `randomizeUnlocked` is an AUTHORING-PREVIEW convenience only (see its own
 * doc) — it does not touch, and is not touched by, the sim's own
 * deterministic unlocked-gene roll (`sim.personaRng`, hollow-11a's
 * `apply.ts`). It's plain client UI code, not sim code, so using `Math.random`
 * as its default source is fine (CLAUDE.md's "never `Math.random()`" rule is
 * about sim-core tick determinism, not authoring-screen preview widgets) —
 * every call site can still inject a deterministic source for tests.
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
import { ARCHETYPE_PRESETS, type PersonaSeed, type ArchetypeEntry, type GeneOverrides } from "@hollow/sim-core/persona";

/** One authoring row: `count` founders of `preset`, plus whatever gene
 *  sliders the director has explicitly touched (`behavior`/`aptitude`/
 *  `appearance`) and which gene names are locked (`lock` — a `BehaviorGene`/
 *  `AptitudeSkill`, or the literal appearance keys `"height"`/`"build"`/
 *  `"skinTone"`/`"hairTone"`, matching `GeneOverrides.lock`'s contract). */
export interface ArchetypeRowState {
  readonly preset: string;
  readonly count: number;
  readonly behavior: Partial<Record<BehaviorGene, number>>;
  readonly aptitude: Partial<Record<AptitudeSkill, number>>;
  readonly appearance: {
    readonly height?: number;
    readonly build?: number;
    readonly skinTone?: SkinToneRole;
    readonly hairTone?: HairToneRole;
  };
  readonly lock: readonly string[];
}

export interface PersonaFormState {
  readonly seed: number;
  readonly archetypes: readonly ArchetypeRowState[];
  readonly foodNodeCount?: number;
  readonly foodNodeMaxStock?: number;
  readonly foodNodeRegenPerTick?: number;
  readonly materialNodeCount?: number;
  readonly materialNodeMaxStock?: number;
  readonly materialNodeRegenPerTick?: number;
}

/** Same deterministic-seed convention as every other Hollow entry point
 *  (main.ts's old constant) — just a starting point the director can edit,
 *  never itself a source of nondeterminism. */
export const DEFAULT_PERSONA_SEED_VALUE = 0x1a1100;
const DEFAULT_ROW_COUNT = 8;

export function emptyArchetypeRow(preset: string, count = 0): ArchetypeRowState {
  return { preset, count, behavior: {}, aptitude: {}, appearance: {}, lock: [] };
}

/** One row per built-in preset (`ARCHETYPE_PRESETS`' own key order), each
 *  seeded with `DEFAULT_ROW_COUNT` founders (5 presets * 8 = 40, matching
 *  economy/constants.ts's `DEFAULT_POPULATION`) and no overrides/locks. */
export function defaultPersonaFormState(): PersonaFormState {
  return {
    seed: DEFAULT_PERSONA_SEED_VALUE,
    archetypes: Object.keys(ARCHETYPE_PRESETS).map((preset) => emptyArchetypeRow(preset, DEFAULT_ROW_COUNT)),
  };
}

export function withSeed(form: PersonaFormState, seed: number): PersonaFormState {
  return { ...form, seed };
}

export function withRow(form: PersonaFormState, index: number, row: ArchetypeRowState): PersonaFormState {
  return { ...form, archetypes: form.archetypes.map((r, i) => (i === index ? row : r)) };
}

export function withCount(row: ArchetypeRowState, count: number): ArchetypeRowState {
  return { ...row, count: Math.max(0, Math.floor(count)) };
}

export function withLockToggled(row: ArchetypeRowState, gene: string): ArchetypeRowState {
  const has = row.lock.includes(gene);
  return { ...row, lock: has ? row.lock.filter((g) => g !== gene) : [...row.lock, gene] };
}

export function withBehaviorValue(row: ArchetypeRowState, gene: BehaviorGene, value: number): ArchetypeRowState {
  return { ...row, behavior: { ...row.behavior, [gene]: value } };
}

export function withAptitudeValue(row: ArchetypeRowState, skill: AptitudeSkill, value: number): ArchetypeRowState {
  return { ...row, aptitude: { ...row.aptitude, [skill]: value } };
}

export function withAppearanceNumber(row: ArchetypeRowState, key: "height" | "build", value: number): ArchetypeRowState {
  return { ...row, appearance: { ...row.appearance, [key]: value } };
}

export function withAppearanceTone(
  row: ArchetypeRowState,
  key: "skinTone" | "hairTone",
  value: SkinToneRole | HairToneRole,
): ArchetypeRowState {
  return { ...row, appearance: { ...row.appearance, [key]: value } };
}

function roll(rand: () => number, min: number, max: number): number {
  return Math.round((min + rand() * (max - min)) * 1000) / 1000;
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  const idx = Math.min(arr.length - 1, Math.floor(rand() * arr.length));
  return arr[idx] as T;
}

/**
 * Rolls every UNLOCKED gene slider to a fresh random value in its valid
 * range — an authoring-preview convenience (see this module's header).
 * Locked genes' current values (or absence — an untouched locked slider
 * stays untouched, same as `apply.ts`'s `lockedValue` falling back to the
 * preset template) are left exactly as they were.
 */
export function randomizeUnlocked(row: ArchetypeRowState, rand: () => number = Math.random): ArchetypeRowState {
  const locked = new Set(row.lock);

  const behavior = { ...row.behavior };
  for (const gene of BEHAVIOR_GENES) {
    if (locked.has(gene)) continue;
    behavior[gene] = roll(rand, GENE_MIN, GENE_MAX);
  }

  const aptitude = { ...row.aptitude };
  for (const skill of APTITUDE_SKILLS) {
    if (locked.has(skill)) continue;
    aptitude[skill] = roll(rand, GENE_MIN, GENE_MAX);
  }

  const appearance = { ...row.appearance };
  if (!locked.has("height")) appearance.height = roll(rand, APPEARANCE_HEIGHT_MIN, APPEARANCE_HEIGHT_MAX);
  if (!locked.has("build")) appearance.build = roll(rand, APPEARANCE_BUILD_MIN, APPEARANCE_BUILD_MAX);
  if (!locked.has("skinTone")) appearance.skinTone = pick(rand, SKIN_TONE_ROLES);
  if (!locked.has("hairTone")) appearance.hairTone = pick(rand, HAIR_TONE_ROLES);

  return { ...row, behavior, aptitude, appearance };
}

function nonEmpty<T extends object>(o: T): T | undefined {
  return Object.keys(o).length > 0 ? o : undefined;
}

function rowOverrides(row: ArchetypeRowState): GeneOverrides | undefined {
  const behavior = nonEmpty(row.behavior);
  const aptitude = nonEmpty(row.aptitude);
  const appearance = nonEmpty(row.appearance);
  const lock = row.lock.length > 0 ? [...row.lock] : undefined;
  if (!behavior && !aptitude && !appearance && !lock) return undefined;
  return {
    ...(behavior ? { behavior } : {}),
    ...(aptitude ? { aptitude } : {}),
    ...(appearance ? { appearance } : {}),
    ...(lock ? { lock } : {}),
  };
}

/**
 * Builds a `PersonaSeed` from the authoring form. PURE, unit-tested — the
 * only thing `persona-setup-panel.ts`'s "Start" button calls before posting
 * to the worker. Rows with `count <= 0` are dropped entirely (never sent as
 * a zero-count archetype entry — `expandArchetypes`, sim-core, would just
 * loop zero times anyway, but dropping them keeps the wire payload small and
 * the round-trip through `encodeRunDescriptor` shorter).
 */
export function buildPersonaSeed(form: PersonaFormState): PersonaSeed {
  const archetypes: ArchetypeEntry[] = form.archetypes
    .filter((row) => row.count > 0)
    .map((row) => {
      const overrides = rowOverrides(row);
      return { preset: row.preset, count: row.count, ...(overrides ? { overrides } : {}) };
    });

  return {
    seed: form.seed,
    ...(archetypes.length > 0 ? { archetypes } : {}),
    ...(form.foodNodeCount !== undefined ? { foodNodeCount: form.foodNodeCount } : {}),
    ...(form.foodNodeMaxStock !== undefined ? { foodNodeMaxStock: form.foodNodeMaxStock } : {}),
    ...(form.foodNodeRegenPerTick !== undefined ? { foodNodeRegenPerTick: form.foodNodeRegenPerTick } : {}),
    ...(form.materialNodeCount !== undefined ? { materialNodeCount: form.materialNodeCount } : {}),
    ...(form.materialNodeMaxStock !== undefined ? { materialNodeMaxStock: form.materialNodeMaxStock } : {}),
    ...(form.materialNodeRegenPerTick !== undefined ? { materialNodeRegenPerTick: form.materialNodeRegenPerTick } : {}),
  };
}
