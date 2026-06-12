/**
 * wgsl-lint.test.ts — build-time WGSL validation guard (brief 11)
 *
 * WGSL is invisible to tsc and vitest: a shader that fails to compile only black-screens the game
 * at runtime in a real browser. This test provides two layers of defence:
 *
 * Layer 1 — wgsl_reflect parser (v1.4.0, exact pinned devDependency):
 *   Parses every *.wgsl under this directory with WgslReflect, which throws on syntax errors such as
 *   missing semicolons, unclosed blocks, and malformed attributes. It does NOT catch semantic errors
 *   like reserved-keyword identifiers, undeclared variables, or type mismatches.
 *
 * Layer 2 — reserved-keyword scan (original lint, kept because parser doesn't subsume it):
 *   wgsl_reflect 1.4.0 silently accepts reserved words as identifiers (e.g. `fn active()` parses
 *   without error). The regex scan below catches the class of mistake that caused the 2026-06-12
 *   black-screen incident. Both layers are needed.
 *
 * NEGATIVE FIXTURES — "prove it bites":
 *   The "negative fixture" describe blocks below run inline WGSL strings through both validators and
 *   assert they throw/fail. These are the canonical proof that the guards actually bite on broken
 *   code; they do not modify any real shader file.
 *
 * Import note: wgsl_reflect's "main" field points to a CJS file despite the package declaring
 * "type":"module". The vitest.config.ts alias `wgsl_reflect → wgsl_reflect/wgsl_reflect.module.js`
 * redirects to the correct ESM entry. TypeScript resolves the type declarations from the package's
 * "types" field (types/index.d.ts) which exports WgslReflect correctly.
 */

import { describe, it, expect } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WgslReflect } from "wgsl_reflect";

const SHADER_DIR = dirname(fileURLToPath(import.meta.url));

// ── Glob all *.wgsl recursively so future shaders are covered automatically ─────────────────────
const shaderFiles: string[] = globSync("**/*.wgsl", { cwd: SHADER_DIR });

// ── WGSL reserved keywords (spec §quantities — "Reserved Words") ─────────────────────────────────
// These must never be used as identifiers. Not to be confused with context-dependent names.
// Kept because wgsl_reflect 1.4.0 does not reject reserved-keyword identifiers at parse time.
const RESERVED = new Set<string>([
  "NULL", "Self", "abstract", "active", "alignas", "alignof", "as", "asm", "asm_fragment", "async",
  "attribute", "auto", "await", "become", "binding_array", "cast", "catch", "class", "co_await",
  "co_return", "co_yield", "coherent", "column_major", "common", "compile", "compile_fragment",
  "concept", "const_cast", "consteval", "constexpr", "constinit", "crate", "debugger", "decltype",
  "delete", "demote", "demote_to_helper", "do", "dynamic_cast", "enum", "explicit", "export",
  "extends", "extern", "external", "fallthrough", "filter", "final", "finally", "friend", "from",
  "fxgroup", "get", "goto", "groupshared", "highp", "impl", "implements", "import", "inline",
  "instanceof", "interface", "layout", "lowp", "macro", "macro_rules", "match", "mediump", "meta",
  "mod", "module", "move", "mut", "mutable", "namespace", "new", "nil", "noexcept", "noinline",
  "nointerpolation", "non_coherent", "noncoherent", "noperspective", "null", "nullptr", "of",
  "operator", "package", "packoffset", "partition", "pass", "patch", "pixelfragment", "precise",
  "precision", "premerge", "priv", "protected", "pub", "public", "readonly", "ref", "regardless",
  "register", "reinterpret_cast", "require", "resource", "restrict", "self", "set", "shared",
  "sizeof", "smooth", "snorm", "static", "static_assert", "static_cast", "std", "subroutine",
  "super", "target", "template", "this", "thread_local", "throw", "trait", "try", "type", "typedef",
  "typeid", "typename", "typeof", "union", "unless", "unorm", "unsafe", "unsized", "use", "using",
  "varying", "virtual", "volatile", "wgsl", "where", "with", "writeonly", "yield",
]);

/** Identifier declaration sites we can spot with a regex: `let/var/const NAME`, `fn NAME`, params. */
function declaredIdentifiers(src: string): string[] {
  const names: string[] = [];
  // let/var/const X   (var<...> X is also covered by allowing an optional <...> template)
  for (const m of src.matchAll(/\b(?:let|const|var(?:<[^>]*>)?)\s+([A-Za-z_]\w*)/g)) names.push(m[1]!);
  // fn X(
  for (const m of src.matchAll(/\bfn\s+([A-Za-z_]\w*)/g)) names.push(m[1]!);
  // function parameters: `(name : T` or `, name : T`  (param list entries)
  for (const m of src.matchAll(/[(,]\s*([A-Za-z_]\w*)\s*:/g)) names.push(m[1]!);
  return names;
}

// ── Negative fixtures — prove the guards bite ────────────────────────────────────────────────────

describe("WGSL validation guard — negative fixtures (must throw/fail)", () => {
  // Layer 1: syntax errors that wgsl_reflect catches
  it("parser rejects a missing semicolon after statement", () => {
    const broken = "fn foo() { let x = 1 }"; // missing ';' after '1'
    expect(() => new WgslReflect(broken), "WgslReflect should throw on missing semicolon").toThrow();
  });

  it("parser rejects a completely malformed shader", () => {
    const garbage = "@@@not_wgsl_at_all!!!";
    expect(() => new WgslReflect(garbage), "WgslReflect should throw on garbage input").toThrow();
  });

  it("parser rejects an unclosed function body", () => {
    const unclosed = "fn foo() -> f32 {";
    expect(() => new WgslReflect(unclosed), "WgslReflect should throw on unclosed block").toThrow();
  });

  // Layer 2: reserved-keyword identifiers that wgsl_reflect silently accepts — the regex catches these
  it("reserved-keyword scan flags 'active' as a function name", () => {
    const src = "fn active() -> f32 { return 0.0; }"; // 'active' is a WGSL reserved word
    const offenders = declaredIdentifiers(src).filter((n) => RESERVED.has(n));
    expect(offenders, "should have flagged 'active'").toContain("active");
  });

  it("reserved-keyword scan flags 'active' as a variable name", () => {
    const src = "fn foo() { let active : f32 = 0.0; }"; // 'active' used as let binding
    const offenders = declaredIdentifiers(src).filter((n) => RESERVED.has(n));
    expect(offenders, "should have flagged 'active'").toContain("active");
  });
});

// ── Real shaders — both layers applied ──────────────────────────────────────────────────────────

describe("WGSL shaders — parser (wgsl_reflect) + reserved-keyword scan", () => {
  it("finds at least one shader to validate", () => {
    expect(shaderFiles.length, "no *.wgsl files found under shader directory").toBeGreaterThan(0);
  });

  for (const relPath of shaderFiles) {
    const file = relPath; // relative to SHADER_DIR (may include subdirs for future shaders)

    it(`${file} — parses without syntax errors (wgsl_reflect)`, () => {
      const src = readFileSync(join(SHADER_DIR, file), "utf8");
      // WgslReflect throws with a message containing the line number on any parse error.
      expect(
        () => new WgslReflect(src),
        `${file} failed wgsl_reflect parse — check for missing semicolons, unclosed blocks, or bad attributes`,
      ).not.toThrow();
    });

    it(`${file} — no reserved-keyword identifiers`, () => {
      const src = readFileSync(join(SHADER_DIR, file), "utf8");
      const offenders = declaredIdentifiers(src).filter((n) => RESERVED.has(n));
      expect(
        offenders,
        `${file} uses WGSL reserved keyword(s) as identifiers: ${[...new Set(offenders)].join(", ")}`,
      ).toEqual([]);
    });
  }
});
