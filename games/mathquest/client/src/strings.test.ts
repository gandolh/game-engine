/**
 * MateQuest M5 slice 2 — `Strings`/`STRINGS_RO`/`STRINGS_EN`/`getStrings`
 * (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md). Asserts the two bundles expose the
 * IDENTICAL set of keys (no missing translation), that a representative sample of EN values are
 * non-empty and DIFFER from their RO counterpart, and that `getStrings` resolves correctly
 * (including the "RO is the default" fallback).
 */
import { describe, it, expect } from "vitest";
import { getStrings, STRINGS_EN, STRINGS_RO, type Strings } from "./strings";

/** Every key on `Strings` (own enumerable properties — methods included, since they're defined as
 * plain object properties on both bundles, not prototype methods). */
function keysOf(s: Strings): string[] {
  return Object.keys(s).sort();
}

describe("STRINGS_RO / STRINGS_EN — identical key sets (no missing translation)", () => {
  it("both bundles expose exactly the same set of keys", () => {
    expect(keysOf(STRINGS_EN)).toEqual(keysOf(STRINGS_RO));
  });

  it("every key's VALUE has the same JS type in both bundles (string vs function, record vs array)", () => {
    for (const key of keysOf(STRINGS_RO)) {
      const ro = (STRINGS_RO as unknown as Record<string, unknown>)[key];
      const en = (STRINGS_EN as unknown as Record<string, unknown>)[key];
      expect(typeof en, `key "${key}"`).toBe(typeof ro);
      expect(Array.isArray(en), `key "${key}"`).toBe(Array.isArray(ro));
    }
  });
});

describe("STRINGS_EN — a real translation, not a passthrough (spot-check)", () => {
  it("plain labels differ from RO and are non-empty", () => {
    const pairs: readonly [en: string, ro: string][] = [
      [STRINGS_EN.title, STRINGS_RO.title],
      [STRINGS_EN.won, STRINGS_RO.won],
      [STRINGS_EN.lost, STRINGS_RO.lost],
      [STRINGS_EN.restart, STRINGS_RO.restart],
      [STRINGS_EN.mapTitle, STRINGS_RO.mapTitle],
      [STRINGS_EN.warriorHpLabel, STRINGS_RO.warriorHpLabel],
      [STRINGS_EN.runWon, STRINGS_RO.runWon],
      [STRINGS_EN.runLost, STRINGS_RO.runLost],
      [STRINGS_EN.newRun, STRINGS_RO.newRun],
      [STRINGS_EN.levelUpTitle, STRINGS_RO.levelUpTitle],
      [STRINGS_EN.lootTitle, STRINGS_RO.lootTitle],
      [STRINGS_EN.lootSkip, STRINGS_RO.lootSkip],
      [STRINGS_EN.hintPrefix, STRINGS_RO.hintPrefix],
      [STRINGS_EN.localeSwitchNote, STRINGS_RO.localeSwitchNote],
    ];
    for (const [en, ro] of pairs) {
      expect(en.length).toBeGreaterThan(0);
      expect(en).not.toBe(ro);
    }
  });

  it("heroName (a folklore proper name) is IDENTICAL in both locales — never translated", () => {
    expect(STRINGS_EN.heroName).toBe(STRINGS_RO.heroName);
    expect(STRINGS_EN.heroName).toBe("Făt-Frumos");
  });

  it("languageCode is IDENTICAL in both bundles (a language CODE, not translated prose)", () => {
    expect(STRINGS_EN.languageCode).toEqual(STRINGS_RO.languageCode);
    expect(STRINGS_EN.languageCode).toEqual({ ro: "RO", en: "EN" });
  });

  it("actionLabel: Attack/Heal/Shield differ from Atacă/Vindecă/Scut", () => {
    expect(STRINGS_EN.actionLabel.attack).toBe("Attack");
    expect(STRINGS_EN.actionLabel.heal).toBe("Heal");
    expect(STRINGS_EN.actionLabel.shield).toBe("Shield");
    expect(STRINGS_RO.actionLabel.attack).toBe("Atacă");
    expect(STRINGS_RO.actionLabel.heal).toBe("Vindecă");
    expect(STRINGS_RO.actionLabel.shield).toBe("Scut");
  });

  it("legendLabel/statLabel/topicName/lifelineName every entry is non-empty, and differs from RO except loanwords ('Boss')", () => {
    const recordPairs: readonly [Record<string, string>, Record<string, string>][] = [
      [STRINGS_EN.legendLabel, STRINGS_RO.legendLabel],
      [STRINGS_EN.statLabel, STRINGS_RO.statLabel],
      [STRINGS_EN.topicName, STRINGS_RO.topicName],
      [STRINGS_EN.lifelineName, STRINGS_RO.lifelineName],
    ];
    // "Boss" is an English loanword MateQuest's own RO text already uses verbatim (see
    // `legendLabel.boss`); "50-50" (the lifeline name) is a bare numeral, identical in any
    // language — neither is a missed translation.
    const allowedIdentical = new Set(["boss", "fifty"]);
    for (const [en, ro] of recordPairs) {
      for (const key of Object.keys(ro)) {
        expect(en[key]?.length ?? 0).toBeGreaterThan(0);
        if (allowedIdentical.has(key)) continue;
        expect(en[key]).not.toBe(ro[key]);
      }
    }
  });

  it("zoneName: all 4 banners differ from RO, same length", () => {
    expect(STRINGS_EN.zoneName.length).toBe(STRINGS_RO.zoneName.length);
    for (let i = 0; i < STRINGS_RO.zoneName.length; i++) {
      expect(STRINGS_EN.zoneName[i]).not.toBe(STRINGS_RO.zoneName[i]);
    }
  });

  it("formatter fns produce different wording for the same inputs", () => {
    expect(STRINGS_EN.gradeReadout(2)).not.toBe(STRINGS_RO.gradeReadout(2));
    expect(STRINGS_EN.turnLabel(3)).not.toBe(STRINGS_RO.turnLabel(3));
    expect(STRINGS_EN.levelLabel(4)).not.toBe(STRINGS_RO.levelLabel(4));
    // xpLabel: "XP" is the SAME abbreviation in both bundles (an intentional loanword, like
    // "Boss" above) — its VALUE is identical, so only its non-empty-ness is worth asserting here.
    expect(STRINGS_EN.xpLabel(2, 5)).toBe("XP 2/5");
    expect(STRINGS_EN.runSummary(3, 10, 30)).not.toBe(STRINGS_RO.runSummary(3, 10, 30));
    expect(STRINGS_EN.masteryHudLabel(5)).not.toBe(STRINGS_RO.masteryHudLabel(5));
    expect(STRINGS_EN.lifelineLabel("hint", 2)).not.toBe(STRINGS_RO.lifelineLabel("hint", 2));
    expect(STRINGS_EN.masteryLine("addition", { correct: 12, attempts: 15 })).not.toBe(
      STRINGS_RO.masteryLine("addition", { correct: 12, attempts: 15 }),
    );
  });

  it("playerResultCue/enemyResultCue differ across every kind", () => {
    expect(STRINGS_EN.playerResultCue({ kind: "landed", action: "attack", amount: 5 })).not.toBe(
      STRINGS_RO.playerResultCue({ kind: "landed", action: "attack", amount: 5 }),
    );
    expect(STRINGS_EN.playerResultCue({ kind: "fizzle", action: "heal" })).not.toBe(
      STRINGS_RO.playerResultCue({ kind: "fizzle", action: "heal" }),
    );
    expect(STRINGS_EN.enemyResultCue({ kind: "enemy_hit", amount: 4, blocked: 2 }, "Zmeu pui")).not.toBe(
      STRINGS_RO.enemyResultCue({ kind: "enemy_hit", amount: 4, blocked: 2 }, "Zmeu pui"),
    );
    // "none" is empty in both — not a translation gap, just nothing to show yet.
    expect(STRINGS_EN.playerResultCue({ kind: "none" })).toBe("");
    expect(STRINGS_RO.playerResultCue({ kind: "none" })).toBe("");
  });

  it("bonusSummary/lifelineSummary differ when non-empty, both empty on an all-zero/undefined input", () => {
    expect(STRINGS_EN.bonusSummary({ atk: 2, block: 3 })).not.toBe(STRINGS_RO.bonusSummary({ atk: 2, block: 3 }));
    expect(STRINGS_EN.bonusSummary({})).toBe("");
    expect(STRINGS_RO.bonusSummary({})).toBe("");
    expect(STRINGS_EN.lifelineSummary({ kind: "hint", charges: 2 })).not.toBe(
      STRINGS_RO.lifelineSummary({ kind: "hint", charges: 2 }),
    );
    expect(STRINGS_EN.lifelineSummary(undefined)).toBe("");
    expect(STRINGS_RO.lifelineSummary(undefined)).toBe("");
  });
});

describe("getStrings — resolution + RO default", () => {
  it("'ro' -> STRINGS_RO, 'en' -> STRINGS_EN", () => {
    expect(getStrings("ro")).toBe(STRINGS_RO);
    expect(getStrings("en")).toBe(STRINGS_EN);
  });

  it("omitted -> STRINGS_RO (Romanian is the default)", () => {
    expect(getStrings()).toBe(STRINGS_RO);
    expect(getStrings(undefined)).toBe(STRINGS_RO);
  });
});
