/**
 * Re-export shim (chunk hollow-10a) — the pure metric computations that
 * used to live here directly (chunk hollow-07) were promoted to
 * `@hollow/sim-core/observe` as the single source of truth shared by this
 * CLI and the browser client's sim worker. Kept as a re-export so every
 * existing import of `"./metrics"` in this tool (and `metrics.test.ts`,
 * unchanged) keeps resolving without a single import-path edit.
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
} from "@hollow/sim-core/observe";
