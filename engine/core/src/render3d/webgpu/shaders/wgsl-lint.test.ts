// Sibling of ../../../render/webgpu/shaders/wgsl-lint.test.ts: that test's
// SHADER_DIR is its OWN directory (dirname(import.meta.url)), so it only
// scans the 2D renderer's shaders — it does not pick up files under here.
// This copy applies the same wgsl_reflect parse + reserved-keyword scan to
// render3d's own shader directory so scene3d.wgsl gets the same guard.

import { describe, it, expect } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { WgslReflect } from "wgsl_reflect";

const SHADER_DIR = dirname(fileURLToPath(import.meta.url));

const shaderFiles: string[] = globSync("**/*.wgsl", { cwd: SHADER_DIR });

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

function declaredIdentifiers(src: string): string[] {
  const names: string[] = [];
  for (const m of src.matchAll(/\b(?:let|const|var(?:<[^>]*>)?)\s+([A-Za-z_]\w*)/g)) names.push(m[1]!);
  for (const m of src.matchAll(/\bfn\s+([A-Za-z_]\w*)/g)) names.push(m[1]!);
  for (const m of src.matchAll(/[(,]\s*([A-Za-z_]\w*)\s*:/g)) names.push(m[1]!);
  return names;
}

describe("render3d WGSL shaders — parser (wgsl_reflect) + reserved-keyword scan", () => {
  it("finds at least one shader to validate", () => {
    expect(shaderFiles.length, "no *.wgsl files found under render3d/webgpu/shaders").toBeGreaterThan(0);
  });

  for (const relPath of shaderFiles) {
    const file = relPath;

    it(`${file} — parses without syntax errors (wgsl_reflect)`, () => {
      const src = readFileSync(join(SHADER_DIR, file), "utf8");
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
