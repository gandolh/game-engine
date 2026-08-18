// glsl-lint.test.ts — regex/structural lint for this project's GLSL ES 3.00
// shaders. Replacement (in spirit) for the two `wgsl-lint.test.ts` guards
// under ../../webgpu/shaders/ and ../../../render3d/webgpu/shaders/, one
// per WebGPU backend this migration retires.
//
// IMPORTANT — honesty about what this is: WGSL has `wgsl_reflect`, a real
// parser this project already depends on, so the WGSL guard could assert
// "parses without syntax errors." GLSL ES has no equivalent lightweight
// parser available here (a real compile only happens against an actual
// GL driver, which `compileProgram` in ../program.ts is the one place that
// does — see its test for the real compile-error path). This file is a
// regex/structural scan, NOT a parser and NOT a compiler. It enforces four
// house rules; a shader that passes this lint has not been proven to
// compile, only to follow these conventions:
//
//   1. Line 1 is exactly "#version 300 es" — must be the literal first
//      line, no leading blank line.
//   2. Every `*.frag.glsl` file declares a precision qualifier
//      ("precision mediump float;" or "highp") — omitting this is valid on
//      some drivers and undefined behaviour (commonly a black screen) on
//      others, so it is the single most common "works in Chrome, black
//      screen in Firefox" GLSL ES bug.
//   3. No GLSL ES 3.00 reserved word is used as a declared identifier.
//   4. No raw hex or RGB colour literal — the shader-side arm of this
//      project's palette-role-constant rule (every colour comes from a
//      named `EDG.*`/`CITADEL_PAL.*`/etc constant, never a literal).
//      Colours must arrive as uniforms. This is a hard gate, not a nicety.

import { describe, it, expect } from "vitest";
import { globSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SHADER_DIR = dirname(fileURLToPath(import.meta.url));

const shaderFiles: string[] = globSync("**/*.glsl", { cwd: SHADER_DIR });

// GLSL ES 3.00 keywords (current + "reserved for future use", per the spec
// §3.6). Not exhaustive of every ES-family extension keyword, but covers
// the set a shader author in this repo would plausibly collide with.
const RESERVED = new Set<string>([
  "attribute", "const", "uniform", "varying", "layout", "centroid", "flat", "smooth",
  "break", "continue", "do", "for", "while", "switch", "case", "default", "if", "else",
  "in", "out", "inout", "float", "int", "void", "bool", "true", "false", "invariant",
  "discard", "return", "mat2", "mat3", "mat4", "mat2x2", "mat2x3", "mat2x4", "mat3x2",
  "mat3x3", "mat3x4", "mat4x2", "mat4x3", "mat4x4", "vec2", "vec3", "vec4", "ivec2",
  "ivec3", "ivec4", "bvec2", "bvec3", "bvec4", "uint", "uvec2", "uvec3", "uvec4", "lowp",
  "mediump", "highp", "precision", "sampler2D", "sampler3D", "samplerCube",
  "sampler2DShadow", "samplerCubeShadow", "sampler2DArray", "sampler2DArrayShadow",
  "isampler2D", "isampler3D", "isamplerCube", "isampler2DArray", "usampler2D",
  "usampler3D", "usamplerCube", "usampler2DArray", "struct",
  "coherent", "volatile", "restrict", "readonly", "writeonly", "resource", "atomic_uint",
  "noperspective", "patch", "sample", "subroutine", "common", "partition", "active",
  "filter", "image1D", "image2D", "image3D", "imageCube", "iimage1D", "iimage2D",
  "iimage3D", "iimageCube", "uimage1D", "uimage2D", "uimage3D", "uimageCube",
  "image1DArray", "image2DArray", "iimage1DArray", "iimage2DArray", "uimage1DArray",
  "uimage2DArray", "image2DMS", "iimage2DMS", "uimage2DMS", "image2DMSArray",
  "iimage2DMSArray", "uimage2DMSArray", "image2DRect", "iimage2DRect", "uimage2DRect",
  "imageBuffer", "iimageBuffer", "uimageBuffer", "sampler1D", "sampler1DShadow",
  "sampler1DArray", "sampler1DArrayShadow", "isampler1D", "isampler1DArray",
  "usampler1D", "usampler1DArray", "sampler2DRect", "sampler2DRectShadow",
  "isampler2DRect", "usampler2DRect", "samplerBuffer", "isamplerBuffer",
  "usamplerBuffer", "sampler2DMS", "isampler2DMS", "usampler2DMS", "sampler2DMSArray",
  "isampler2DMSArray", "usampler2DMSArray", "samplerCubeArray", "samplerCubeArrayShadow",
  "isamplerCubeArray", "usamplerCubeArray", "hvec2", "hvec3", "hvec4", "dvec2", "dvec3",
  "dvec4", "fvec2", "fvec3", "fvec4", "sampler3DRect", "double", "long", "unsigned",
  "superp", "template", "this", "goto", "inline", "noinline", "public", "static",
  "extern", "external", "interface", "sizeof", "cast", "namespace", "using",
]);

// Basic GLSL ES 3.00 type keywords used to anchor a declaration
// ("TYPE identifier" followed by one of `; = , ) ( [`). This intentionally
// does not fire on a type used as a constructor call with no following
// identifier (e.g. `vec4(0.0, 0.0, 0.0, 1.0)` — no space + name between
// `vec4` and `(`).
const TYPES = [
  "float", "int", "uint", "bool", "void",
  "vec2", "vec3", "vec4", "ivec2", "ivec3", "ivec4", "uvec2", "uvec3", "uvec4",
  "bvec2", "bvec3", "bvec4",
  "mat2", "mat3", "mat4", "mat2x2", "mat2x3", "mat2x4", "mat3x2", "mat3x3", "mat3x4",
  "mat4x2", "mat4x3", "mat4x4",
  "sampler2D", "sampler3D", "samplerCube", "sampler2DArray", "sampler2DShadow",
  "samplerCubeShadow", "isampler2D", "usampler2D",
];
const DECLARATION_RE = new RegExp(
  `\\b(?:${TYPES.join("|")})\\s+([A-Za-z_]\\w*)\\s*(?=[;=,)([])`,
  "g",
);

/** True iff `src`'s very first line (no leading blank line) is `#version 300 es`. */
function hasVersionLine(src: string): boolean {
  return src.split("\n")[0] === "#version 300 es";
}

function isFragmentShader(fileName: string): boolean {
  return fileName.endsWith(".frag.glsl");
}

/** True iff `src` declares `precision (lowp|mediump|highp) float;` anywhere. */
function hasPrecisionQualifier(src: string): boolean {
  return /\bprecision\s+(?:lowp|mediump|highp)\s+float\s*;/.test(src);
}

function declaredIdentifiers(src: string): string[] {
  const names: string[] = [];
  for (const m of src.matchAll(DECLARATION_RE)) names.push(m[1]!);
  return names;
}

// Hex integer literal shaped like a packed RRGGBB/RRGGBBAA colour
// (e.g. `0xFF6B35`) — valid GLSL ES integer-literal syntax, so the driver
// would happily compile it; this project's palette rule forbids it anyway.
const HEX_COLOR_RE = /\b0x[0-9a-fA-F]{6,8}\b/g;

// A vec3/vec4 constructor called with 3-4 all-numeric-literal arguments —
// the shape of a hardcoded RGB(A) colour constant. Known false-positive
// risk: a genuine non-colour numeric vec3/vec4 (e.g. a hardcoded direction
// or offset) has the same shape and will also be flagged; that trade-off is
// accepted deliberately (an honest, occasionally-over-eager regex lint
// beats a semantic check this project doesn't have the tooling to write).
const RGB_LITERAL_RE = /\bvec[34]\(\s*[0-9]*\.?[0-9]+f?\s*(?:,\s*[0-9]*\.?[0-9]+f?\s*){2,3}\)/g;

function findColorLiterals(src: string): string[] {
  return [...(src.match(HEX_COLOR_RE) ?? []), ...(src.match(RGB_LITERAL_RE) ?? [])];
}

describe("GLSL lint guard — negative fixtures (must catch the failure)", () => {
  it("flags a shader with no #version line at all", () => {
    const src = "precision mediump float;\nvoid main() {}\n";
    expect(hasVersionLine(src), "missing #version should not pass").toBe(false);
  });

  it("flags a shader with a leading blank line before #version", () => {
    const src = "\n#version 300 es\nvoid main() {}\n";
    expect(hasVersionLine(src), "#version must be the literal first line").toBe(false);
  });

  it("flags a fragment shader missing a precision qualifier", () => {
    const src = "#version 300 es\nout vec4 o_color;\nvoid main() { o_color = vec4(1.0); }\n";
    expect(hasPrecisionQualifier(src), "missing precision qualifier should not pass").toBe(false);
  });

  it("flags a reserved word used as a declared identifier (variable)", () => {
    const src = "#version 300 es\nvoid main() { float active = 1.0; }\n";
    const offenders = declaredIdentifiers(src).filter((n) => RESERVED.has(n));
    expect(offenders, "should have flagged 'active'").toContain("active");
  });

  it("flags a reserved word used as a declared identifier (function)", () => {
    const src = "#version 300 es\nfloat filter(float x) { return x; }\n";
    const offenders = declaredIdentifiers(src).filter((n) => RESERVED.has(n));
    expect(offenders, "should have flagged 'filter'").toContain("filter");
  });

  it("flags a hardcoded hex colour literal", () => {
    const src = "#version 300 es\nvoid main() { int c = 0xFF6B35; }\n";
    expect(findColorLiterals(src).length, "hex literal 0xFF6B35 should be flagged").toBeGreaterThan(0);
  });

  it("flags a hardcoded RGB float literal passed to vec3/vec4", () => {
    const src = "#version 300 es\nvoid main() { vec3 c = vec3(1.0, 0.42, 0.0); }\n";
    expect(findColorLiterals(src).length, "vec3(1.0, 0.42, 0.0) should be flagged").toBeGreaterThan(0);
  });

  it("does NOT flag a conforming shader shape (sanity check on the happy path)", () => {
    const src =
      "#version 300 es\nprecision mediump float;\nuniform vec4 u_tint;\nout vec4 o_color;\n" +
      "void main() { o_color = u_tint; }\n";
    expect(hasVersionLine(src)).toBe(true);
    expect(hasPrecisionQualifier(src)).toBe(true);
    expect(declaredIdentifiers(src).filter((n) => RESERVED.has(n))).toEqual([]);
    expect(findColorLiterals(src)).toEqual([]);
  });
});

describe("GLSL shaders — structural lint (regex-based, NOT a real parser/compiler)", () => {
  it("finds at least one shader to validate", () => {
    expect(shaderFiles.length, "no *.glsl files found under shader directory").toBeGreaterThan(0);
  });

  for (const relPath of shaderFiles) {
    const file = relPath;

    it(`${file} — line 1 is exactly "#version 300 es"`, () => {
      const src = readFileSync(join(SHADER_DIR, file), "utf8");
      expect(
        hasVersionLine(src),
        `${file} must open with "#version 300 es" as its literal first line`,
      ).toBe(true);
    });

    if (isFragmentShader(file)) {
      it(`${file} — declares a precision qualifier`, () => {
        const src = readFileSync(join(SHADER_DIR, file), "utf8");
        expect(
          hasPrecisionQualifier(src),
          `${file} (a fragment shader) must declare "precision mediump/highp float;"`,
        ).toBe(true);
      });
    }

    it(`${file} — no reserved-keyword identifiers`, () => {
      const src = readFileSync(join(SHADER_DIR, file), "utf8");
      const offenders = declaredIdentifiers(src).filter((n) => RESERVED.has(n));
      expect(
        offenders,
        `${file} uses GLSL ES 3.00 reserved keyword(s) as identifiers: ${[...new Set(offenders)].join(", ")}`,
      ).toEqual([]);
    });

    it(`${file} — no raw hex/RGB colour literal`, () => {
      const src = readFileSync(join(SHADER_DIR, file), "utf8");
      const offenders = findColorLiterals(src);
      expect(
        offenders,
        `${file} has a hardcoded colour literal (${offenders.join(", ")}) — colours must arrive ` +
          `as a uniform sourced from a named palette-role constant`,
      ).toEqual([]);
    });
  }
});
