/**
 * MateQuest M5 folklore theming, slice 1 of 3
 * (corpus/todos/2026-07-23-mathquest-M5-folklore-theming.md) — `enemyFor`'s balance-preservation
 * guarantee (stats EXACTLY equal `ENEMY_ARCHETYPES[kind]`, exhaustively over every zone) plus the
 * roster's name/title table.
 */
import { describe, it, expect } from "vitest";
import { ENEMY_ARCHETYPES, enemyFor, type EnemyKind } from "./enemies";
import type { Zone } from "./map";

const ZONES: readonly Zone[] = [0, 1, 2, 3];
const KINDS: readonly EnemyKind[] = ["combat", "elite", "boss"];

describe("enemyFor — balance-preservation (LOCKED stats)", () => {
  it("for every (kind, zone), the returned hp/intentBase/intentRoll EXACTLY equal ENEMY_ARCHETYPES[kind]", () => {
    for (const kind of KINDS) {
      for (const zone of ZONES) {
        const themed = enemyFor(kind, zone);
        const base = ENEMY_ARCHETYPES[kind];
        expect(themed.maxHp).toBe(base.maxHp);
        expect(themed.intentBase).toBe(base.intentBase);
        expect(themed.intentRoll).toBe(base.intentRoll);
      }
    }
  });

  it("is a PURE function: repeated calls with the same (kind, zone) return the identical archetype", () => {
    for (const kind of KINDS) {
      for (const zone of ZONES) {
        expect(enemyFor(kind, zone)).toEqual(enemyFor(kind, zone));
      }
    }
  });
});

describe("enemyFor — the RO folklore roster (LOCKED names/epithets)", () => {
  it("combat: forest/village/mountains/lair each have their own name+title", () => {
    expect(enemyFor("combat", 0)).toMatchObject({ name: "Zmeu pui", title: "puiul balaurului" });
    expect(enemyFor("combat", 1)).toMatchObject({ name: "Strigoi", title: "mortul viu" });
    expect(enemyFor("combat", 2)).toMatchObject({ name: "Căpcăun", title: "uriașul munților" });
    expect(enemyFor("combat", 3)).toMatchObject({ name: "Slugă de Zmeu", title: "sluga stăpânului" });
  });

  it("elite: forest/village/mountains/lair each have their own name+title", () => {
    expect(enemyFor("elite", 0)).toMatchObject({ name: "Muma Pădurii", title: "vrăjitoarea codrului" });
    expect(enemyFor("elite", 1)).toMatchObject({ name: "Vârcolac", title: "fiara lunii" });
    expect(enemyFor("elite", 2)).toMatchObject({ name: "Balaur", title: "balaurul cu multe capete" });
    expect(enemyFor("elite", 3)).toMatchObject({ name: "Zmeu", title: "zmeul din bârlog" });
  });

  it("boss is always 'Zmeu bătrân' regardless of zone (one boss, always in the lair)", () => {
    for (const zone of ZONES) {
      expect(enemyFor("boss", zone)).toMatchObject({ name: "Zmeu bătrân", title: "stăpânul bârlogului" });
    }
  });

  it("every roster entry's name/title is a non-empty RO literal (no accidental blanks)", () => {
    for (const kind of KINDS) {
      for (const zone of ZONES) {
        const themed = enemyFor(kind, zone);
        expect(themed.name.length).toBeGreaterThan(0);
        expect(themed.title.length).toBeGreaterThan(0);
      }
    }
  });
});

// =================================================================================================
// M5 slice 2 (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md) — enemyFor(kind, zone, locale)
// =================================================================================================

describe("enemyFor — locale (M5 slice 2)", () => {
  it("omitting locale is byte-identical to explicitly passing 'ro' (default)", () => {
    for (const kind of KINDS) {
      for (const zone of ZONES) {
        expect(enemyFor(kind, zone)).toEqual(enemyFor(kind, zone, "ro"));
      }
    }
  });

  it("'en' keeps the EXACT same folklore NAME as 'ro' for every (kind, zone) — names are the theme, not translated", () => {
    for (const kind of KINDS) {
      for (const zone of ZONES) {
        expect(enemyFor(kind, zone, "en").name).toBe(enemyFor(kind, zone, "ro").name);
        expect(enemyFor(kind, zone, "en").sprite).toBe(enemyFor(kind, zone, "ro").sprite);
      }
    }
  });

  it("'en' gives a DIFFERENT (translated) title than 'ro' for every (kind, zone)", () => {
    for (const kind of KINDS) {
      for (const zone of ZONES) {
        const ro = enemyFor(kind, zone, "ro");
        const en = enemyFor(kind, zone, "en");
        expect(en.title).not.toBe(ro.title);
        expect(en.title.length).toBeGreaterThan(0);
      }
    }
  });

  it("'en' stats EXACTLY equal ENEMY_ARCHETYPES[kind] too — balance is locked in BOTH locales", () => {
    for (const kind of KINDS) {
      for (const zone of ZONES) {
        const themed = enemyFor(kind, zone, "en");
        const base = ENEMY_ARCHETYPES[kind];
        expect(themed.maxHp).toBe(base.maxHp);
        expect(themed.intentBase).toBe(base.intentBase);
        expect(themed.intentRoll).toBe(base.intentRoll);
      }
    }
  });

  it("specific EN epithets — the dragon's whelp / lord of the lair / the many-headed dragon", () => {
    expect(enemyFor("combat", 0, "en")).toMatchObject({ name: "Zmeu pui", title: "the dragon's whelp" });
    expect(enemyFor("elite", 2, "en")).toMatchObject({ name: "Balaur", title: "the many-headed dragon" });
    expect(enemyFor("boss", 3, "en")).toMatchObject({ name: "Zmeu bătrân", title: "lord of the lair" });
  });

  it("boss's EN title is the SAME regardless of zone (zone-independent, like the RO title)", () => {
    for (const zone of ZONES) {
      expect(enemyFor("boss", zone, "en").title).toBe("lord of the lair");
    }
  });

  it("is a PURE function: repeated calls with the same (kind, zone, locale) return the identical archetype", () => {
    for (const kind of KINDS) {
      for (const zone of ZONES) {
        expect(enemyFor(kind, zone, "en")).toEqual(enemyFor(kind, zone, "en"));
      }
    }
  });
});
