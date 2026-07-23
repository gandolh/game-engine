/**
 * MateQuest M5 slice 2 — `parseLocale` (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md).
 * Mirrors `run/mastery.test.ts`'s `parseMasteryStore` coverage shape: valid values round-trip,
 * everything else falls back to the DEFAULT ("ro").
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, parseLocale } from "./i18n";

describe("DEFAULT_LOCALE", () => {
  it("is 'ro' (Romanian is the default language)", () => {
    expect(DEFAULT_LOCALE).toBe("ro");
  });
});

describe("LOCALE_STORAGE_KEY", () => {
  it("is the fixed, versioned storage key", () => {
    expect(LOCALE_STORAGE_KEY).toBe("mathquest.locale.v1");
  });
});

describe("parseLocale — validate-or-default-to-'ro'", () => {
  it("'ro' -> 'ro'", () => {
    expect(parseLocale("ro")).toBe("ro");
  });

  it("'en' -> 'en'", () => {
    expect(parseLocale("en")).toBe("en");
  });

  it("null -> 'ro' (fresh install / no stored preference)", () => {
    expect(parseLocale(null)).toBe("ro");
  });

  it("garbage/foreign values -> 'ro'", () => {
    expect(parseLocale("fr")).toBe("ro");
    expect(parseLocale("RO")).toBe("ro"); // case-sensitive — not the exact literal
    expect(parseLocale("EN")).toBe("ro");
    expect(parseLocale("")).toBe("ro");
    expect(parseLocale("{not json")).toBe("ro");
    expect(parseLocale("null")).toBe("ro");
  });
});
