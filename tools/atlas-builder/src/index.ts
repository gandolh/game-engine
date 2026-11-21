/**
 * `npm run atlas [-- <game id>…] [-- --force]`: cooks the registered games' atlases (corpus brief 09).
 * `FORCE=1` is the same as `--force`.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAtlas } from "./cook";
import { ATLAS_GAMES } from "./games";

export { buildAtlas, type BuildResult } from "./cook";
export { checkSwatches, type AtlasConfig, type AtlasRecipe, type Rgba } from "./config";
export { ATLAS_GAMES } from "./games";

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const force = args.includes("--force") || process.env["FORCE"] === "1";
  const ids = args.filter((a) => !a.startsWith("--"));
  const unknown = ids.filter((id) => !ATLAS_GAMES.some((g) => g.id === id));
  if (unknown.length > 0) {
    console.error(
      `atlas-builder: no game "${unknown.join('", "')}"; registered: ${ATLAS_GAMES.map((g) => g.id).join(", ")}`,
    );
    process.exit(2);
  }
  for (const config of ATLAS_GAMES) {
    if (ids.length === 0 || ids.includes(config.id)) buildAtlas(config, { force });
  }
}
