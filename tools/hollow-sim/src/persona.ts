/**
 * Node-fs PersonaSeed loader (chunk hollow-11a promotes the FORMAT + the
 * pure `applyPersonaSeed`/`personaSeedToSimOptions` logic to
 * `@hollow/sim-core/persona` — this file keeps only the `node:fs`-touching
 * bits, since `@hollow/sim-core` must stay browser-safe for 11b's GUI to
 * bundle it — see that module's header).
 *
 * `loadPersonaSeed` is intentionally loose (no schema validation beyond
 * `JSON.parse` — a missing/extra key is simply ignored by
 * `applyPersonaSeed`/`personaSeedToSimOptions`), matching v1's original
 * "keep it minimal" note.
 */
import { readFileSync } from "node:fs";
import type { PersonaSeed } from "@hollow/sim-core/persona";

export type { PersonaSeed } from "@hollow/sim-core/persona";
export { applyPersonaSeed, personaSeedToSimOptions, ARCHETYPE_PRESETS } from "@hollow/sim-core/persona";

export function loadPersonaSeed(path: string): PersonaSeed {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as PersonaSeed;
}
