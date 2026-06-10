// fingerprint.ts — hashing helpers for per-sheet incremental atlas builds.
// Cache key per sheet = SHA-256 over (in fixed order):
//   1. BUILDER_VERSION integer
//   2. Pinned PNG encoder options (as JSON)
//   3. Packing constants (PADDING, pow2 policy)
//   4. Sheet id
//   5. Contents of palette.ts, sheet-map.ts, types.ts (shared by all sheets)
//   6. Contents of every asset file whose recipe maps to this sheet (sorted paths)
//   7. For sheets with generated frames: also recipes/index.ts + templates.ts
//
// Files are hashed by CONTENT, never mtime (mtimes lie after `git checkout`).
// Inputs are fed in a fixed documented order so the hash is deterministic.
//
// IMPORTANT: PNG_OPTIONS is exported as a const. Pass a spread `{ ...PNG_OPTIONS }`
// to PNG.sync.write to prevent pngjs from mutating this object with its defaults
// (which would change the hash on subsequent calls within the same process).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Bump this whenever atlas-builder logic changes output (packing algorithm,
// rasterizer, encoder options, etc.).  A changed version forces every sheet
// to miss the cache and rebuild.
export const BUILDER_VERSION = 1;

// The pinned PNG encoder options — must stay in sync with the write call in index.ts.
// NOTE: always spread this when passing to PNG.sync.write: `{ ...PNG_OPTIONS }`.
// pngjs mutates the options object it receives; spreading prevents the constant
// from being poisoned with pngjs defaults, which would corrupt the hash on the
// second sheet processed in the same builder run.
export const PNG_OPTIONS = { filterType: 0, deflateLevel: 9, deflateStrategy: 3 } as const;

// Packing constants — must stay in sync with packShelf in index.ts.
export const PACK_CONSTANTS = { PADDING: 1, pow2: true } as const;

/**
 * Hash the contents of a single file.  Throws if the file cannot be read.
 */
function hashFile(filePath: string, h: ReturnType<typeof createHash>): void {
  const content = readFileSync(filePath);
  h.update(content);
}

/**
 * Compute the SHA-256 fingerprint for one atlas sheet.
 *
 * @param sheetId        The sheet being fingerprinted (e.g. "crops").
 * @param assetFilePaths Sorted list of asset file paths whose recipes map to this sheet.
 * @param sharedSrcDir   Directory containing palette.ts / sheet-map.ts / types.ts.
 * @param hasGeneratedFrames  True for sheets with procedurally-generated frames.
 * @param recipesIndexPath    Path to recipes/index.ts (used when hasGeneratedFrames).
 * @param templatesPath       Path to recipes/templates.ts (used when hasGeneratedFrames).
 */
export function computeSheetHash(
  sheetId: string,
  assetFilePaths: readonly string[],
  sharedSrcDir: string,
  hasGeneratedFrames: boolean,
  recipesIndexPath: string,
  templatesPath: string,
): string {
  const h = createHash("sha256");

  // 1. Builder version (invalidates all caches when logic changes)
  h.update(`BUILDER_VERSION=${BUILDER_VERSION}\n`);

  // 2. PNG options (encoder change → different bytes → cache miss)
  h.update(`PNG_OPTIONS=${JSON.stringify(PNG_OPTIONS)}\n`);

  // 3. Packing constants
  h.update(`PACK_CONSTANTS=${JSON.stringify(PACK_CONSTANTS)}\n`);

  // 4. Sheet id (different sheets use a different hash even if their inputs overlap)
  h.update(`SHEET_ID=${sheetId}\n`);

  // 5. Shared sources (palette change recolors every sheet; sheet-map/types change the data shape)
  hashFile(`${sharedSrcDir}/palette.ts`, h);
  hashFile(`${sharedSrcDir}/sheet-map.ts`, h);
  hashFile(`${sharedSrcDir}/types.ts`, h);

  // 6. Per-asset recipe files for this sheet (sorted for determinism)
  for (const p of assetFilePaths) {
    hashFile(p, h);
  }

  // 7. Generator sources for sheets with procedurally-generated frames
  if (hasGeneratedFrames) {
    hashFile(recipesIndexPath, h);
    hashFile(templatesPath, h);
  }

  return h.digest("hex");
}
