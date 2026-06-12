/**
 * wgsl-lint.test.ts — a cheap build-time guard for the WGSL shaders.
 *
 * Nothing else in the toolchain validates WGSL: tsc treats `*.wgsl?raw` as opaque strings and vitest
 * runs in jsdom with no WebGPU, so a shader that fails to compile only black-screens the game at
 * runtime in a real browser (see the 2026-06-12 `active`-keyword incident). This test catches the most
 * common foot-gun — declaring an identifier whose name is a WGSL *reserved keyword* — without adding a
 * full WGSL parser dependency. It's a lint, not a validator: it won't catch every shader error, but it
 * fails CI on the class of mistake that took the renderer down.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SHADER_DIR = dirname(fileURLToPath(import.meta.url));

// WGSL reserved keywords (spec §quantities — "Reserved Words"). These must never be used as
// identifiers. Not to be confused with context-dependent names (which are allowed as identifiers).
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

/** Identifier declaration sites we can spot with a regex: `let/var/const NAME`, `fn NAME`, and params. */
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

const shaderFiles = readdirSync(SHADER_DIR).filter((f) => f.endsWith(".wgsl"));

describe("WGSL shaders — no reserved keywords as identifiers", () => {
  it("finds at least one shader to lint", () => {
    expect(shaderFiles.length).toBeGreaterThan(0);
  });

  for (const file of shaderFiles) {
    it(`${file} declares no reserved-keyword identifiers`, () => {
      const src = readFileSync(join(SHADER_DIR, file), "utf8");
      const offenders = declaredIdentifiers(src).filter((n) => RESERVED.has(n));
      expect(
        offenders,
        `${file} uses WGSL reserved keyword(s) as identifiers: ${[...new Set(offenders)].join(", ")}`,
      ).toEqual([]);
    });
  }
});
