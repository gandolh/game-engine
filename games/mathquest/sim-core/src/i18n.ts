/**
 * MateQuest M5 slice 2 — the `Locale` seam (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md).
 *
 * LOCKED architecture (see the brief's "Architecture decision"): the sim is locale-aware via an
 * init option — like `seed`/`mastery` — and emits localized `prompt`/`teach`/enemy `name`/`title`
 * text for the chosen locale. Toggling the locale RE-INITS the sim (a fresh run in the new
 * language); mastery survives because it is persisted separately (M4c) and re-loaded on the new
 * `init`. **Romanian is the DEFAULT** — any call site that omits `locale` (every pre-M5-slice-2
 * call site, including every existing test) behaves exactly as before this slice.
 *
 * Determinism (root CLAUDE.md): `locale` is a fixed INPUT, like `seed`/`mastery` — it changes only
 * WORDS (which strings a generator/enemy emits), never an `Rng` draw, never which numbers/topics/
 * nodes are generated. Every generator draws its operands FIRST, then formats — see
 * `combat/generators.ts`'s module doc + `generators.test.ts`'s locale-determinism assertion.
 *
 * Mirrors `run/mastery.ts`'s `parseMasteryStore` shape: a pure, total, validate-or-default
 * parser, so both the client (`main.ts`, reading `localStorage`) and this package's own tests can
 * exercise it without any DOM/storage dependency. This module — like `run/mastery.ts` — never
 * touches `localStorage`/DOM itself; the client owns the actual read/write (see
 * `client/src/main.ts`'s `loadLocale`/`saveLocale`, mirroring its M4c `loadMastery`/`saveMastery`).
 */

/** RO/EN — Romanian is the DEFAULT (per the user directive 2026-07-22, carried into this slice). */
export type Locale = "ro" | "en";

/** The default locale — every optional `locale?: Locale` parameter across sim-core falls back to
 * this, so an omitted `locale` is byte-identical to pre-M5-slice-2 behaviour. */
export const DEFAULT_LOCALE: Locale = "ro";

/** The single `localStorage` key the main thread reads/writes (`client/src/main.ts`) — mirrors
 * `run/mastery.ts`'s `MASTERY_STORAGE_KEY`. The sim/worker never references this constant for an
 * actual storage call, only for round-tripping it through `init`. */
export const LOCALE_STORAGE_KEY = "mathquest.locale.v1";

/** Parses a `localStorage`-read string into a `Locale` — validate-or-default-to-`"ro"` (mirrors
 * `run/mastery.ts`'s `parseMasteryStore`'s "validate-or-reset" story): `null`, any string that
 * isn't exactly `"ro"`/`"en"` (garbage, a stale/foreign value, a future locale this build doesn't
 * know), all fall back to the default rather than limping along with an untrusted value. */
export function parseLocale(raw: string | null): Locale {
  return raw === "ro" || raw === "en" ? raw : DEFAULT_LOCALE;
}
