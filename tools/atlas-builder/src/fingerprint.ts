// Cache key per sheet = SHA-256 over: BUILDER_VERSION, PNG_OPTIONS, PACK_CONSTANTS, sheet id,
// palette/sheet-map/types content, sorted asset file contents, and (if generated) index+templates.
// Files hashed by CONTENT (not mtime — mtimes lie after git checkout).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Bump BUILDER_VERSION when packing/rasterizer/encoder logic changes output.
export const BUILDER_VERSION = 1;

// Pinned encoder options — must stay in sync with index.ts write call.
// Always spread when passing to PNG.sync.write: pngjs mutates the options object it receives.
export const PNG_OPTIONS = { filterType: 0, deflateLevel: 9, deflateStrategy: 3 } as const;

// Must stay in sync with packShelf in index.ts.
export const PACK_CONSTANTS = { PADDING: 1, pow2: true } as const;

function hashFile(filePath: string, h: ReturnType<typeof createHash>): void {
  const content = readFileSync(filePath);
  h.update(content);
}

export function computeSheetHash(
  sheetId: string,
  assetFilePaths: readonly string[],
  sharedSrcDir: string,
  hasGeneratedFrames: boolean,
  recipesIndexPath: string,
  templatesPath: string,
): string {
  const h = createHash("sha256");

  h.update(`BUILDER_VERSION=${BUILDER_VERSION}\n`);
  h.update(`PNG_OPTIONS=${JSON.stringify(PNG_OPTIONS)}\n`);
  h.update(`PACK_CONSTANTS=${JSON.stringify(PACK_CONSTANTS)}\n`);
  h.update(`SHEET_ID=${sheetId}\n`);
  hashFile(`${sharedSrcDir}/palette.ts`, h);
  hashFile(`${sharedSrcDir}/sheet-map.ts`, h);
  hashFile(`${sharedSrcDir}/types.ts`, h);
  for (const p of assetFilePaths) {
    hashFile(p, h);
  }
  if (hasGeneratedFrames) {
    hashFile(recipesIndexPath, h);
    hashFile(templatesPath, h);
  }

  return h.digest("hex");
}
