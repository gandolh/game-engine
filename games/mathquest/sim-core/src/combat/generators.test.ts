import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { GENERATORS, TOPICS_FOR_GRADE } from "./generators";
import { ADD_SUB_RANGE } from "./constants";
import type { Grade, MathTopic, Problem } from "./types";

const GRADES: readonly Grade[] = [1, 2, 3, 4];
const RELATIONS = ["<", ">", "="] as const;

/** Pull the numbers embedded in a prompt/choice-prompt (works for every topic's prompt shape). */
function numbersIn(text: string): number[] {
  return (text.match(/-?\d+/g) ?? []).map(Number);
}

/** Independently re-derive and verify a generated `Problem` — never trusts the generator's own
 * `answer`/`answerIndex`, per the M2 brief's A7: "compute independently". */
function verifyProblem(p: Problem): void {
  const [x, y] = numbersIn(p.prompt);
  expect(x).toBeDefined();
  expect(y).toBeDefined();

  if (p.kind === "typed") {
    if (p.topic === "addition") {
      expect(p.answer).toBe(x! + y!);
    } else if (p.topic === "subtraction") {
      expect(x!).toBeGreaterThanOrEqual(y!); // a >= b, non-negative
      expect(p.answer).toBe(x! - y!);
      expect(p.answer).toBeGreaterThanOrEqual(0);
    } else if (p.topic === "multiplication") {
      expect(p.answer).toBe(x! * y!);
      expect(p.answer).toBeLessThanOrEqual(9999); // brief: cap product/sum ≤ 9999
    }
  } else {
    // comparison
    expect(p.choices.length).toBe(3);
    expect([...p.choices].sort()).toEqual([...RELATIONS].sort());
    const relation = x! < y! ? "<" : x! > y! ? ">" : "=";
    expect(p.choices[p.answerIndex]).toBe(relation);
  }
}

describe("TOPICS_FOR_GRADE", () => {
  it("grade 1 excludes multiplication (curriculum introduces × in clasa a II-a)", () => {
    expect(TOPICS_FOR_GRADE[1]).toEqual(["addition", "subtraction", "comparison"]);
    expect(TOPICS_FOR_GRADE[1]).not.toContain("multiplication");
  });

  it("grades 2-4 include all four topics", () => {
    for (const g of [2, 3, 4] as const) {
      expect(new Set(TOPICS_FOR_GRADE[g])).toEqual(
        new Set(["addition", "subtraction", "multiplication", "comparison"]),
      );
    }
  });
});

describe("GENERATORS — determinism + independently-verified correctness, per (topic, grade)", () => {
  for (const grade of GRADES) {
    for (const topic of TOPICS_FOR_GRADE[grade]) {
      it(`${topic} @ grade ${grade}: same seed ⇒ same problem, and the math checks out`, () => {
        const a = GENERATORS[topic](createRng(1000 + grade * 7), grade);
        const b = GENERATORS[topic](createRng(1000 + grade * 7), grade);
        expect(a).toEqual(b); // determinism: identical seed ⇒ identical problem
        expect(a.grade).toBe(grade);
        expect(a.topic).toBe(topic);
        expect(a.teach.length).toBeGreaterThan(0);
        verifyProblem(a);
      });

      it(`${topic} @ grade ${grade}: holds across many draws (range invariants aren't a fluke)`, () => {
        for (let seed = 1; seed <= 40; seed++) {
          const p = GENERATORS[topic](createRng(seed * 31 + grade), grade);
          verifyProblem(p);
        }
      });
    }
  }

  it("multiplication throws for grade 1 (never dispatched there, but must fail loudly if it is)", () => {
    expect(() => GENERATORS.multiplication(createRng(1), 1)).toThrow();
  });
});

describe("addition/subtraction operand ranges match ADD_SUB_RANGE per grade", () => {
  const topics: readonly MathTopic[] = ["addition", "subtraction"];
  for (const grade of GRADES) {
    for (const topic of topics) {
      it(`${topic} @ grade ${grade}: operands stay within [${ADD_SUB_RANGE[grade].min}, ${ADD_SUB_RANGE[grade].max}]`, () => {
        const range = ADD_SUB_RANGE[grade];
        for (let seed = 1; seed <= 30; seed++) {
          const p = GENERATORS[topic](createRng(seed * 17 + grade), grade);
          const [x, y] = numbersIn(p.prompt);
          expect(x).toBeGreaterThanOrEqual(range.min);
          expect(x).toBeLessThanOrEqual(range.max);
          expect(y).toBeGreaterThanOrEqual(range.min);
          expect(y).toBeLessThanOrEqual(range.max);
        }
      });
    }
  }
});

describe("multiplication ranges per grade", () => {
  it("grade 2: both operands in 1..10 (times-table facts)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = GENERATORS.multiplication(createRng(seed), 2);
      const [x, y] = numbersIn(p.prompt);
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(10);
    }
  });

  it("grade 3: a is 2-digit (10..99), b is 1-digit (1..9)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = GENERATORS.multiplication(createRng(seed), 3);
      const [x, y] = numbersIn(p.prompt);
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(99);
      expect(y).toBeGreaterThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(9);
    }
  });

  it("grade 4: both operands 2-digit (10..99), product capped ≤ 9999", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = GENERATORS.multiplication(createRng(seed), 4);
      const [x, y] = numbersIn(p.prompt);
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(99);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(99);
      if (p.kind === "typed") expect(p.answer).toBeLessThanOrEqual(9999);
    }
  });
});

// =================================================================================================
// M5 slice 2 (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md) — locale localizes WORDS only.
// =================================================================================================

describe("GENERATORS — locale localizes words only, never numbers/rng consumption", () => {
  it("omitting locale is byte-identical to explicitly passing 'ro' (default), for every topic", () => {
    for (const grade of GRADES) {
      for (const topic of TOPICS_FOR_GRADE[grade]) {
        const withoutLocale = GENERATORS[topic](createRng(42), grade);
        const withRo = GENERATORS[topic](createRng(42), grade, "ro");
        expect(withoutLocale).toEqual(withRo);
      }
    }
  });

  it("the SAME seed under 'ro' vs 'en' draws the IDENTICAL operands/answer/answerIndex, only the words differ", () => {
    for (const grade of GRADES) {
      for (const topic of TOPICS_FOR_GRADE[grade]) {
        const ro = GENERATORS[topic](createRng(7000 + grade), grade, "ro");
        const en = GENERATORS[topic](createRng(7000 + grade), grade, "en");

        // Same numbers embedded in the prompt (operands are drawn BEFORE locale ever formats text).
        expect(numbersIn(en.prompt)).toEqual(numbersIn(ro.prompt));

        if (ro.kind === "typed" && en.kind === "typed") {
          expect(en.answer).toBe(ro.answer); // locale-independent (never crosses the boundary anyway)
        } else if (ro.kind === "choice" && en.kind === "choice") {
          expect(en.answerIndex).toBe(ro.answerIndex);
          expect(en.choices).toEqual(ro.choices); // "<"/">"/"=" are symbolic, not translated
        } else {
          throw new Error("locale must never change a problem's kind");
        }
      }
    }
  });

  it("comparison's EN prompt says 'Compare'/'and'; RO says 'Compară'/'și'", () => {
    const ro = GENERATORS.comparison(createRng(11), 2, "ro");
    const en = GENERATORS.comparison(createRng(11), 2, "en");
    expect(ro.prompt).toContain("Compară");
    expect(ro.prompt).toContain("și");
    expect(en.prompt).toContain("Compare");
    expect(en.prompt).toContain("and");
    expect(en.prompt).not.toContain("Compară");
  });

  it("addition/subtraction/comparison EN teach text differs from RO at least once per grade (a real translation)", () => {
    // Multiplication's teach text is ONLY locale-dependent in its "times table" branch (both
    // operands <=10) — exercised separately below, since grades 3/4's operand ranges rarely/never
    // land there (see `multiplicationTeach`'s doc), so it's excluded from this generic sweep.
    const topics: readonly MathTopic[] = ["addition", "subtraction", "comparison"];
    for (const grade of GRADES) {
      for (const topic of topics) {
        if (!TOPICS_FOR_GRADE[grade].includes(topic)) continue;
        let sawADifference = false;
        for (let seed = 1; seed <= 30; seed++) {
          const ro = GENERATORS[topic](createRng(seed * 13 + grade), grade, "ro");
          const en = GENERATORS[topic](createRng(seed * 13 + grade), grade, "en");
          if (ro.teach !== en.teach) sawADifference = true;
        }
        expect(sawADifference, `${topic} @ grade ${grade}: RO and EN teach text never differ`).toBe(true);
      }
    }
  });

  it("multiplication's 'times table' teach tag is locale-specific ('tabla înmulțirii' vs 'times table')", () => {
    // Grade 2 with small operands (<=10 and <=10) always hits the "table fact" branch.
    const ro = GENERATORS.multiplication(createRng(1), 2, "ro");
    const en = GENERATORS.multiplication(createRng(1), 2, "en");
    expect(ro.teach).toContain("tabla înmulțirii");
    expect(en.teach).toContain("times table");
    expect(en.teach).not.toContain("tabla înmulțirii");
  });
});

describe("comparison — choices + answerIndex", () => {
  it("choices are always exactly the 3 relations, possibly reordered", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = GENERATORS.comparison(createRng(seed), 2);
      if (p.kind !== "choice") throw new Error("comparison must generate a choice problem");
      expect(p.choices.length).toBe(3);
      expect([...p.choices].sort()).toEqual([...RELATIONS].sort());
    }
  });

  it("answerIndex always names the TRUE relation between the two shown numbers", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = GENERATORS.comparison(createRng(seed), 3);
      if (p.kind !== "choice") throw new Error("comparison must generate a choice problem");
      const [x, y] = numbersIn(p.prompt);
      const relation = x! < y! ? "<" : x! > y! ? ">" : "=";
      expect(p.choices[p.answerIndex]).toBe(relation);
    }
  });

  it("the shuffle is itself deterministic (same seed ⇒ same choice order)", () => {
    const a = GENERATORS.comparison(createRng(777), 2);
    const b = GENERATORS.comparison(createRng(777), 2);
    expect(a).toEqual(b);
  });
});
