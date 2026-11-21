/**
 * Every game whose recipes the cook knows (corpus brief 09). `npm run atlas` cooks them all; `npm run atlas --
 * <id>` cooks one. A game joins by exporting an `ATLAS_CONFIG` from its recipe package (Farm's is
 * `@farm/atlas-recipes/atlas`) and adding it here.
 */
import { ATLAS_CONFIG as FARM } from "@farm/atlas-recipes/atlas";
import type { AtlasConfig } from "./config";

export const ATLAS_GAMES: readonly AtlasConfig[] = [FARM];
