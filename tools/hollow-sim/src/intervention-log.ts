/**
 * Node-fs intervention-log loader (chunk hollow-11a) — the CLI-side half of
 * shock replay. `@hollow/sim-core` stays browser-safe (no `node:fs`), so the
 * actual JSON read lives here; the log's shape (`Intervention[]`) and the
 * replay mechanics (`BootedHollowSim.loadInterventionLog`) live in
 * `@hollow/sim-core/protocols`/`sim-bootstrap`.
 */
import { readFileSync } from "node:fs";
import type { Intervention } from "@hollow/sim-core/protocols";

export function loadInterventionLog(path: string): Intervention[] {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as Intervention[];
}
