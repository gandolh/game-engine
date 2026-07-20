/**
 * Re-export shim (chunk hollow-10a) — the chronicle capture that used to
 * live here directly (chunk hollow-07) was promoted to
 * `@hollow/sim-core/observe` as the single source of truth shared by this
 * CLI and the browser client's sim worker. Kept as a re-export so every
 * existing import of `"./chronicle"` in this tool (and `export.test.ts`,
 * unchanged) keeps resolving without a single import-path edit.
 */
export {
  createChronicle,
  countByOntology,
  type ChronicleEvent,
  type DeathsByCause,
  type Chronicle,
} from "@hollow/sim-core/observe";
