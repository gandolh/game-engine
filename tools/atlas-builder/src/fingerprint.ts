import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** The cook's own version, in every sheet's hash: bump it when the cook's output changes for the same inputs. */
export const BUILDER_VERSION = 1;

export const PNG_OPTIONS = { filterType: 0, deflateLevel: 9, deflateStrategy: 3 } as const;

export const PACK_CONSTANTS = { PADDING: 1, pow2: true } as const;

/**
 * A sheet's `inputsHash`: the cook's version and fixed options, the sheet id, then the bytes of every input
 * file in the order the game's config lists them. Unchanged inputs give the same hash, and the sheet is not
 * cooked again.
 */
export function computeSheetHash(sheetId: string, inputFiles: readonly string[]): string {
  const h = createHash("sha256");
  h.update(`BUILDER_VERSION=${BUILDER_VERSION}\n`);
  h.update(`PNG_OPTIONS=${JSON.stringify(PNG_OPTIONS)}\n`);
  h.update(`PACK_CONSTANTS=${JSON.stringify(PACK_CONSTANTS)}\n`);
  h.update(`SHEET_ID=${sheetId}\n`);
  for (const file of inputFiles) h.update(readFileSync(file));
  return h.digest("hex");
}
