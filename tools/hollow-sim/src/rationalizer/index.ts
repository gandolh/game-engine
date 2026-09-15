/**
 * Public surface of the real Claude-backed `Rationalizer` (hollow-13,
 * chunk 4). NOT wired into `index.ts`/`run-core.ts` by this chunk — the
 * controller does that final wiring (see this chunk's task handoff). Import
 * `createClaudeRationalizerFromEnv` to get a `Rationalizer | null` keyed off
 * `ANTHROPIC_API_KEY` (or another env var — see its options), or
 * `createClaudeRationalizer` directly when the caller already has a key in
 * hand and wants a hard failure on a bad one.
 */
export {
  createClaudeRationalizer,
  createClaudeRationalizerFromEnv,
  DEFAULT_MODEL,
  DEFAULT_MAX_IN_FLIGHT,
  DEFAULT_TIMEOUT_MS,
  type ClaudeRationalizerOptions,
  type ClaudeRationalizerFromEnvOptions,
  type AnthropicMessagesClient,
} from "./claude-rationalizer";
