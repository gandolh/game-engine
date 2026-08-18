// glsl-lint.test.ts — regex/structural lint for this project's GLSL ES 3.00
// shaders, sibling of ../../../render/webgl2/shaders/glsl-lint.test.ts (mirrored
// verbatim, rules unchanged — see that file for the canonical copy). It exists
// as a SEPARATE copy because that file's `globSync("**/*.glsl", { cwd:
// SHADER_DIR })` only scans its OWN directory, so it does not see this game's
// (render3d/webgl2/) shaders — same two-copy arrangement the WGSL guard had
// (`render/webgpu/shaders/wgsl-lint.test.ts` +
// `render3d/webgpu/shaders/wgsl-lint.test.ts`) for the same reason.
//
// IMPORTANT — honesty about what this is: WGSL has `wgsl_reflect`, a real
// parser this project already depends on, so the WGSL guard could assert
// "parses without syntax errors." GLSL ES has no equivalent lightweight
// parser available here (a real compile only happens against an actual GL
// driver, which `compileProgram` in ../../../render/webgl2/program.ts is the
// one place that does — see its test for the real compile-error path). This
// file is a regex/structural scan, NOT a parser and NOT a compiler. It
// enforces four house rules; a shader that passes this lint has not been
// proven to compile, only to follow these conventions:
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
/**
 * Strip `//` line comments and block comments before applying the identifier and
 * colour-literal rules.
 *
 * Why: without this, the lint reads PROSE. Brief 07 hit exactly two false
 * positives, both in its own comments — the reserved-word scan flagged the word
 * `in` inside "a pseudo-random float in [0,1)", and the colour-literal scan
 * flagged `vec4(0,0,0,0)` inside "naturally evaluates to vec4(0,0,0,0)". A lint
 * error pointing at a sentence is confusing enough that the next author will
 * weaken the rule instead of fixing real code, so scan code only.
 *
 * Comment bodies are replaced with spaces (newlines preserved) so any line-based
 * reporting stays aligned with the original source.
 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      while (i < src.length && src[i] !== "\n") { out += " "; i += 1; }
    } else if (two === "/*") {
      out += "  "; i += 2;
      while (i < src.length && src.slice(i, i + 2) !== "*/") {
        out += src[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < src.length) { out += "  "; i += 2; }
    } else {
      out += src[i]; i += 1;
    }
  }
  return out;
}

function hasVersionLine(src: string): boolean {
  return src.split("\n")[0] === "#version 300 es";
}

function isFragmentShader(fileName: string): boolean {
  return fileName.endsWith(".frag.glsl");
}

/** True iff `src` declares `precision (lowp|mediump|highp) float;` anywhere. */
function hasPrecisionQualifier(rawSrc: string): boolean {
  const src = stripComments(rawSrc);
  return /\bprecision\s+(?:lowp|mediump|highp)\s+float\s*;/.test(src);
}

function declaredIdentifiers(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
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

function findColorLiterals(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
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

  it("does NOT flag a reserved word appearing only in a comment", () => {
    // Regression guard for brief 07's false positive: the word `in` in prose.
    const src = "#version 300 es\nprecision highp float;\n// returns a pseudo-random float in [0,1)\nvoid main() {}\n";
    expect(declaredIdentifiers(src).filter((n) => RESERVED.has(n))).toEqual([]);
  });

  it("does NOT flag a colour literal appearing only in a comment", () => {
    // Regression guard for brief 07's other false positive.
    const src = "#version 300 es\nprecision highp float;\n/* naturally evaluates to vec4(0,0,0,0) here */\nvoid main() {}\n";
    expect(findColorLiterals(src)).toEqual([]);
  });

  it("still flags a colour literal in CODE even when comments are present", () => {
    const src = "#version 300 es\nprecision highp float;\n// vec3(0.1, 0.2, 0.3) is fine in prose\nvoid main() { vec3 c = vec3(1.0, 0.42, 0.0); }\n";
    expect(findColorLiterals(src).length).toBeGreaterThan(0);
  });

  it("does NOT count a precision qualifier that only appears in a comment", () => {
    const src = "#version 300 es\n// precision mediump float; (intentionally only a comment)\nout vec4 o;\nvoid main() { o = vec4(1.0); }\n";
    expect(hasPrecisionQualifier(src)).toBe(false);
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
