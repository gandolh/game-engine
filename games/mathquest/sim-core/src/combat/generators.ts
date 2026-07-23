/**
 * MateQuest M2 — the deterministic problem-generator seam, keyed by (grade, topic).
 * (corpus/todos/2026-07-22-mathquest-M2-problem-generators.md, Part A2.)
 *
 * FOUR topics only (scope is deliberately bounded — word-problems/fractions/geometry are
 * DEFERRED): addition, subtraction, multiplication (all `"typed"`) and comparison (`"choice"`,
 * `<`/`>`/`=`). `GENERATORS` dispatches by topic; each generator internally branches on `grade`
 * for its operand ranges (`combat/constants.ts`'s `ADD_SUB_RANGE`/`MULT_G*` constants).
 *
 * Determinism (root CLAUDE.md): every generator consumes ONLY the `Rng` it's handed — never
 * `Math.random()`/`Date.now()`. The caller (`sim-bootstrap.ts`) forks a fresh child `Rng` per call
 * (`rng.fork("problem")`); comparison additionally forks its own `rng.fork("shuffle")` child for
 * the choice-order permutation, per the brief.
 *
 * M5 slice 2 (corpus/todos/2026-07-23-mathquest-M5-i18n-toggle.md) adds a `locale` parameter,
 * defaulting to `"ro"` (so every pre-slice-2 call site is byte-identical). **`locale` changes only
 * WORDS, never numbers**: every generator draws its operands FIRST (identical rng consumption
 * regardless of locale), THEN formats the `prompt`/`teach` text for the chosen locale — see
 * `additionTeach`/`subtractionTeach`/`multiplicationTeach`/`comparisonTeach` below and
 * `generateComparison`'s prompt. `answer`/`answerIndex` are locale-independent by construction
 * (the non-leak invariant never crosses this boundary anyway — see `combat/types.ts`).
 */
import type { Rng } from "@engine/core";
import {
  ADD_SUB_RANGE,
  MULT_G2_MAX,
  MULT_G2_MIN,
  MULT_G3_ONES_MAX,
  MULT_G3_ONES_MIN,
  MULT_G3_TENS_MAX,
  MULT_G3_TENS_MIN,
  MULT_G4_MAX,
  MULT_G4_MIN,
} from "./constants";
import { DEFAULT_LOCALE, type Locale } from "../i18n";
import type { Grade, MathTopic, Problem } from "./types";

/** A topic's problem generator: draws whatever it needs from `rng`, scaled by `grade`, formats its
 * `prompt`/`teach` text for `locale` (default `"ro"`). */
export type ProblemGenerator = (rng: Rng, grade: Grade, locale?: Locale) => Problem;

// --- teach-text helpers (short worked-step strings, localized RO/EN — M5 slice 2) ----------------

/** Bridge-to-ten decomposition, e.g. RO "7 + 8: 7 + 3 = 10, apoi + 5 = 15" / EN "7 + 8: 7 + 3 =
 * 10, then + 5 = 15". Falls back to the bare fact when `a` is already a multiple of ten (nothing
 * to bridge) or the bridge would exceed `b`. */
function additionTeach(a: number, b: number, sum: number, locale: Locale): string {
  const toTen = (10 - (a % 10)) % 10;
  if (toTen === 0 || toTen > b) return `${a} + ${b} = ${sum}`;
  const remainder = b - toTen;
  const bridged = a + toTen;
  const then = locale === "en" ? "then" : "apoi";
  return `${a} + ${b}: ${a} + ${toTen} = ${bridged}, ${then} + ${remainder} = ${sum}`;
}

/** Borrow-to-ten decomposition, e.g. RO "15 - 8: 15 - 5 = 10, apoi - 3 = 7" / EN "... then - 3 = 7". */
function subtractionTeach(a: number, b: number, diff: number, locale: Locale): string {
  const toTen = a % 10;
  if (toTen === 0 || toTen > b) return `${a} - ${b} = ${diff}`;
  const remainder = b - toTen;
  const bridged = a - toTen;
  const then = locale === "en" ? "then" : "apoi";
  return `${a} - ${b}: ${a} - ${toTen} = ${bridged}, ${then} - ${remainder} = ${diff}`;
}

/** Table fact (small operands) or a partial-products hint (tens/ones split of `b`). RO "tabla
 * înmulțirii" / EN "times table". */
function multiplicationTeach(a: number, b: number, product: number, locale: Locale): string {
  if (a <= 10 && b <= 10) {
    const tag = locale === "en" ? "times table" : "tabla înmulțirii";
    return `${a} × ${b} = ${product} (${tag})`;
  }
  const tens = Math.floor(b / 10) * 10;
  const ones = b % 10;
  if (tens === 0) return `${a} × ${b} = ${product}`;
  const p1 = a * tens;
  const p2 = a * ones;
  return `${a} × ${b}: ${a} × ${tens} = ${p1}, ${a} × ${ones} = ${p2}, ${p1} + ${p2} = ${product}`;
}

/** Place-value reasoning, e.g. RO "12 > 9: 12 are mai multe cifre decât 9" / EN "12 > 9: 12 has
 * more digits than 9". */
function comparisonTeach(a: number, b: number, relation: "<" | ">" | "=", locale: Locale): string {
  if (relation === "=") return locale === "en" ? `${a} = ${b}: they are equal` : `${a} = ${b}: sunt egale`;
  const [big, small] = relation === ">" ? [a, b] : [b, a];
  if (String(big).length !== String(small).length) {
    return locale === "en"
      ? `${a} ${relation} ${b}: ${big} has more digits than ${small}`
      : `${a} ${relation} ${b}: ${big} are mai multe cifre decât ${small}`;
  }
  return locale === "en"
    ? `${a} ${relation} ${b}: compare the digits from left to right`
    : `${a} ${relation} ${b}: compară cifrele de la stânga la dreapta`;
}

// --- generators -----------------------------------------------------------------------------

function generateAddition(rng: Rng, grade: Grade, locale: Locale = DEFAULT_LOCALE): Problem {
  const range = ADD_SUB_RANGE[grade];
  const a = rng.int(range.min, range.max + 1);
  const b = rng.int(range.min, range.max + 1);
  const answer = a + b;
  return {
    topic: "addition",
    grade,
    kind: "typed",
    prompt: `${a} + ${b} = ?`,
    answer,
    teach: additionTeach(a, b, answer, locale),
  };
}

function generateSubtraction(rng: Rng, grade: Grade, locale: Locale = DEFAULT_LOCALE): Problem {
  const range = ADD_SUB_RANGE[grade];
  const a = rng.int(range.min, range.max + 1);
  // b drawn from [range.min, a] — guarantees a >= b (never negative) by construction.
  const b = rng.int(range.min, a + 1);
  const answer = a - b;
  return {
    topic: "subtraction",
    grade,
    kind: "typed",
    prompt: `${a} - ${b} = ?`,
    answer,
    teach: subtractionTeach(a, b, answer, locale),
  };
}

/** Not valid for grade 1 (Romanian curriculum introduces multiplication in clasa a II-a) — the
 * caller must never dispatch this generator for `grade === 1` (`TOPICS_FOR_GRADE[1]` excludes it). */
function generateMultiplication(rng: Rng, grade: Grade, locale: Locale = DEFAULT_LOCALE): Problem {
  let a: number;
  let b: number;
  switch (grade) {
    case 1:
      throw new Error("multiplication is not a valid topic for grade 1");
    case 2:
      a = rng.int(MULT_G2_MIN, MULT_G2_MAX + 1);
      b = rng.int(MULT_G2_MIN, MULT_G2_MAX + 1);
      break;
    case 3:
      a = rng.int(MULT_G3_TENS_MIN, MULT_G3_TENS_MAX + 1);
      b = rng.int(MULT_G3_ONES_MIN, MULT_G3_ONES_MAX + 1);
      break;
    case 4:
      a = rng.int(MULT_G4_MIN, MULT_G4_MAX + 1);
      b = rng.int(MULT_G4_MIN, MULT_G4_MAX + 1);
      break;
  }
  const answer = a * b;
  return {
    topic: "multiplication",
    grade,
    kind: "typed",
    prompt: `${a} × ${b} = ?`,
    answer,
    teach: multiplicationTeach(a, b, answer, locale),
  };
}

const RELATIONS = ["<", ">", "="] as const;

/** Deterministic Fisher-Yates over `[0, length)`, consuming ONLY `rng`. */
function shuffledIndices(length: number, rng: Rng): number[] {
  const idx = Array.from({ length }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  return idx;
}

function generateComparison(rng: Rng, grade: Grade, locale: Locale = DEFAULT_LOCALE): Problem {
  const range = ADD_SUB_RANGE[grade];
  const a = rng.int(range.min, range.max + 1);
  const b = rng.int(range.min, range.max + 1);
  const relation: "<" | ">" | "=" = a < b ? "<" : a > b ? ">" : "=";

  // Fixed relation order [<, >, =] by author intent, shuffled deterministically per the brief
  // ("you MAY shuffle... as long as answerIndex tracks the shuffle"). The shuffle consumes `rng`
  // BEFORE locale ever touches formatting, so `locale` cannot affect it (determinism — module doc).
  const order = shuffledIndices(RELATIONS.length, rng.fork("shuffle"));
  const choices = order.map((i) => RELATIONS[i]!);
  const answerIndex = order.indexOf(RELATIONS.indexOf(relation));

  const prompt = locale === "en" ? `Compare: ${a} and ${b}` : `Compară: ${a} și ${b}`;
  return {
    topic: "comparison",
    grade,
    kind: "choice",
    prompt,
    choices,
    answerIndex,
    teach: comparisonTeach(a, b, relation, locale),
  };
}

/** Registry of the four M2 generators, keyed by topic. */
export const GENERATORS: Record<MathTopic, ProblemGenerator> = {
  addition: generateAddition,
  subtraction: generateSubtraction,
  multiplication: generateMultiplication,
  comparison: generateComparison,
};

/** Grade-valid topics — grade 1 excludes multiplication (see `generateMultiplication`'s doc). */
export const TOPICS_FOR_GRADE: Record<Grade, readonly MathTopic[]> = {
  1: ["addition", "subtraction", "comparison"],
  2: ["addition", "subtraction", "multiplication", "comparison"],
  3: ["addition", "subtraction", "multiplication", "comparison"],
  4: ["addition", "subtraction", "multiplication", "comparison"],
};
