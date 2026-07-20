/**
 * PersonaSeed — the shared, browser-safe (no `node:fs`) format for authoring
 * a Hollow founding population (chunk hollow-11a). Promotes + extends the
 * minimal v1 seam that used to live only in `tools/hollow-sim/src/persona.ts`
 * (which supported just a flat `founderGenomeBias`/`founders` gene-override
 * list) into `@hollow/sim-core/persona`, so BOTH the headless CLI
 * (`@tool/hollow-sim`) and the M3 authoring GUI (hollow-11b) share one format
 * and one pure `applyPersonaSeed` — see `apply.ts`'s header for the
 * determinism contract.
 *
 * Backward compatibility: `founderGenomeBias`/`founders` (the v1 fields) are
 * still accepted and still apply with their EXACT v1 semantics — a direct,
 * no-`Rng`-draw gene clamp-set, run as a "legacy overlay" AFTER any
 * `archetypes`-driven assignment (see `apply.ts`'s `applyPersonaSeed`) — so
 * an old seed file with only those two fields behaves byte-identically to
 * before this brief.
 */
import type { BehaviorGene, AptitudeSkill, Appearance } from "../components";

/**
 * Per-founder-group gene overrides layered onto an archetype preset.
 * `lock` names genes (a `BehaviorGene`/`AptitudeSkill`, or the literal
 * appearance keys `"height"`/`"build"`/`"skinTone"`/`"hairTone"`) that keep
 * their authored/preset value VERBATIM instead of being rolled with
 * variance — see `apply.ts`'s `rollFounderGenomeInto` for exactly which
 * value "authored" resolves to when locked (override, else preset template,
 * else a documented midpoint fallback).
 */
export interface GeneOverrides {
  behavior?: Partial<Record<BehaviorGene, number>>;
  aptitude?: Partial<Record<AptitudeSkill, number>>;
  appearance?: Partial<Appearance>;
  lock?: string[];
}

/** One archetype-preset entry — `count` founders drawn from `preset`
 *  (`presets.ts`'s `ARCHETYPE_PRESETS` table), with optional per-entry
 *  overrides layered on top of the preset's template. */
export interface ArchetypeEntry {
  /** Key into `ARCHETYPE_PRESETS`. */
  preset: string;
  count: number;
  overrides?: GeneOverrides;
}

/** @deprecated v1 field (kept for backward compatibility — see this file's header). */
export interface FounderOverride {
  behavior?: Record<string, number>;
}

export interface PersonaSeed {
  /** Overrides `HollowSimOptions.seed` when present — see `personaSeedToSimOptions`. */
  seed?: number;
  /** Explicit founding-population size. Defaults to the sum of
   *  `archetypes[].count` when `archetypes` is given; otherwise left unset
   *  (the sim's own `DEFAULT_POPULATION` applies). */
  population?: number;
  foodNodeCount?: number;
  foodNodeMaxStock?: number;
  foodNodeRegenPerTick?: number;
  materialNodeCount?: number;
  materialNodeMaxStock?: number;
  materialNodeRegenPerTick?: number;
  /**
   * Composes the founding population from named presets. Expanded in array
   * order (`archetypes[0]`'s `count` copies first, then `archetypes[1]`'s,
   * ...) and assigned to founders in ASCENDING entity-id order, index for
   * index — see `apply.ts`'s `expandArchetypes`/`applyPersonaSeed`.
   */
  archetypes?: ArchetypeEntry[];
  /** @deprecated v1 field — a blanket per-gene bias applied to EVERY founder. */
  founderGenomeBias?: Record<string, number>;
  /** @deprecated v1 field — per-founder behavior-gene overrides, ascending id order. */
  founders?: FounderOverride[];
}
