/**
 * `@hollow/sim-core/observe` — the single source of truth for Hollow's
 * observability layer (chunk hollow-10a): metric aggregates, the event
 * chronicle, the per-year metrics sampler, and the metrics/events/lineage
 * serializers. Pure/read-only, browser-safe (no `node:fs`/`node:path`/
 * `process`) — consumed by BOTH the headless research CLI
 * (`@tool/hollow-sim`, via thin re-export shims that keep node-fs helpers
 * node-only) and the browser client's sim worker.
 */
export {
  readLivingAgents,
  gini,
  mean,
  meanPairwiseTrust,
  wealthGini,
  meanGenes,
  communityStats,
  sumSocialCounts,
  COOP_VERBS,
  ANTAG_VERBS,
  type LivingAgentRead,
  type CommunityStats,
} from "./metrics";

export {
  createChronicle,
  countByOntology,
  type ChronicleEvent,
  type DeathsByCause,
  type Chronicle,
} from "./chronicle";

export {
  METRICS_COLUMNS,
  flattenMetricsRow,
  metricsCsv,
  metricsJson,
  eventsJsonl,
  lineageJson,
  type MetricsRow,
} from "./export";

export { MetricsSampler } from "./sampler";
