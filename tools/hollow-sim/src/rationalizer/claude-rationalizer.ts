/**
 * The REAL Claude-backed `Rationalizer` (hollow-13, chunk 4) — lives here,
 * in the Node-side headless runner, and NOT in `@hollow/sim-core`.
 *
 * ── why this file is not in @hollow/sim-core ────────────────────────────
 * Hollow's sim runs three ways: headless (this tool), in a browser Web
 * Worker (`@hollow/client`), and under vitest. A Web Worker is browser code
 * — anything `@hollow/sim-core` imports ships to the client bundle. Putting
 * `@anthropic-ai/sdk` (which needs an API key) in sim-core would mean either
 * bundling a secret into client JS or hand-wiring dead code paths into a
 * bundle that never runs it. So sim-core defines only the pure interface
 * (`@hollow/sim-core/rationalize`'s `Rationalizer`/`RationalizerRequest`/
 * `RationalizerResult`) and stays HTTP/SDK-free; this package — Node-only,
 * never bundled for a browser — owns the keyed implementation. Settled in
 * the spec (`corpus/todos/2026-07-17-hollow-13-llm-rationalizer-seam.md`);
 * do not move this call into sim-core.
 *
 * ── the anchoring guarantee lives elsewhere, on purpose ─────────────────
 * This file's only job is: build a small prompt from a `RationalizerRequest`,
 * get JSON back, and hand it to `poll()` callers as `unknown`. It does NOT
 * validate, repair, or reject a response — `@hollow/sim-core/rationalize`'s
 * `validateRationalizerResult` is the one and only anchoring enforcement,
 * and it runs on the OTHER side of this seam (in the sim). A structured-
 * output JSON schema (`RESPONSE_SCHEMA` below) makes a well-formed answer
 * likely, which saves round-trips, but it is a convenience, not the
 * guarantee — a model can still return a shape that violates it (a provider
 * hiccup, a schema Claude satisfies technically but the sim's stricter
 * bounds check rejects), and that must reach the sim as `unknown`, not get
 * quietly "fixed" here. See `types.ts`'s and `validate.ts`'s file headers in
 * sim-core for the full argument.
 *
 * ── submit()/poll() over async/await ────────────────────────────────────
 * Same mailbox contract as `stub.ts`: `submit` fires the request and returns
 * synchronously; the eventual network response (success, malformed body, or
 * provider error) lands in an internal buffer that `poll()` drains. `submit`
 * NEVER throws — every failure mode (auth, rate limit, timeout, network,
 * bad JSON) is caught and turned into a `RationalizerResult.error`, because
 * the sim must keep running on its BDI default no matter what this provider
 * does.
 *
 * ── concurrency: DROP over the cap, not queue ───────────────────────────
 * `maxInFlight` bounds concurrent outbound requests to Anthropic. Over the
 * cap, `submit` DROPS the request immediately (an `error` result on the very
 * next `poll()`) rather than queueing it. Two reasons:
 *   1. `RationalizerSeam` (sim-core) already caps concurrent consultations
 *      across the whole population at `DEFAULT_MAX_IN_FLIGHT` (8) and won't
 *      submit a new request for an agent that already has one outstanding —
 *      so this cap is a second, provider-side bound (e.g. against Anthropic
 *      rate limits), not the sim's only throttle.
 *   2. A queued request pays for a network round trip whose answer, by the
 *      time it is dequeued and returned, is disproportionately likely to be
 *      `stale-candidates` at adoption time anyway (the world has moved on,
 *      possibly past the 40-tick social cooldown) — queueing spends money
 *      and latency on answers the anchoring validator would mostly throw
 *      away. Dropping fails fast and cheap, and the sim already treats "no
 *      answer" as a free, expected outcome (it just keeps the BDI default).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Rationalizer, RationalizerRequest, RationalizerResult } from "@hollow/sim-core/rationalize";

/** Spec default. Configurable to `"claude-sonnet-5"` (or any other model id)
 *  via `ClaudeRationalizerOptions.model`. */
export const DEFAULT_MODEL = "claude-haiku-4-5";

/** Provider-side concurrent-request cap — see this file's header for why
 *  DROP (not queue) is the over-cap policy. Independent of, and smaller
 *  than, the seam's own `DEFAULT_MAX_IN_FLIGHT` (8). */
export const DEFAULT_MAX_IN_FLIGHT = 4;

/** Per-request network timeout. A consultation only matters for a handful
 *  of ticks (`DEFAULT_REQUEST_TIMEOUT_TICKS` in the seam) before the sim
 *  gives up on it anyway, so there is no reason to let one hang long. */
export const DEFAULT_TIMEOUT_MS = 8_000;

/** Answers are a `choiceIndex` and a short rationale — 300 output tokens is
 *  generous headroom over `RATIONALE_MAX_CHARS` (400 chars, ~100 tokens). */
const MAX_OUTPUT_TOKENS = 300;

/**
 * The structured-output schema. `choiceIndex` accepts an integer OR `null`
 * via `anyOf` (the JSON-schema subset the API supports explicitly lists
 * `anyOf` as supported; a bare `type: ["integer","null"]` array is not
 * documented, so this is the safer spelling). This is a convenience for the
 * model, not the anchoring guarantee — see this file's header.
 */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    choiceIndex: { anyOf: [{ type: "integer" }, { type: "null" }] },
    rationale: { type: "string" },
  },
  required: ["choiceIndex", "rationale"],
  additionalProperties: false,
} as const;

/**
 * The minimal slice of `Anthropic` this file actually calls — a dependency-
 * injection seam so tests can hand in a mock with no network access and no
 * cast gymnastics, instead of constructing (or subclassing) a real SDK
 * client. A real `new Anthropic(...)` instance satisfies this structurally
 * (its `messages.create` is strictly more capable — streaming overloads,
 * richer `RequestOptions` — and method signatures are checked bivariantly),
 * so production code passes no `client` at all and gets the real thing.
 */
export interface AnthropicMessagesClient {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
      options?: { readonly timeout?: number },
    ): Promise<Anthropic.Message>;
  };
}

const SYSTEM_PROMPT =
  "You are advising one simulated villager in a small life-simulation. " +
  "A substrate has already computed a set of FEASIBLE candidate actions for " +
  "this villager — each already validated against the live world state " +
  "(resources on hand, distance, ownership) — plus a default choice the " +
  "substrate would take on its own. Your only job is to either agree with " +
  "the default or pick a different candidate BY INDEX, and give a short, " +
  "plain-English reason. You may not describe or propose any action that is " +
  "not already in the candidate list; if none of the candidates seem right, " +
  "answer with choiceIndex null to keep the default.";

/** Only the fields a decision needs, straight off `RationalizerRequest` —
 *  never anything the request doesn't already carry (spec: "never send
 *  anything not in RationalizerRequest"). `agentId`/`tick`/
 *  `candidateFingerprint` are bookkeeping for the harness, not decision
 *  inputs, so they are left out of the prompt payload. */
function buildUserContent(request: RationalizerRequest): string {
  const payload = {
    genome: request.genome,
    beliefs: request.beliefs,
    needs: request.needs,
    relationships: request.relationships,
    standing: request.standing,
    candidates: request.candidates.map((c) => ({ index: c.index, kind: c.kind, data: c.data, score: c.score })),
    bdiDefaultIndex: request.bdiChoiceIndex,
  };
  return JSON.stringify(payload);
}

/** Turns any thrown value into a short, loggable string using the SDK's
 *  typed exception chain — never string-matching a message. Most-specific
 *  first: timeout before its own parent connection-error class, then the
 *  two named 4xx classes, then the general status-error catch-all, then a
 *  plain `Error`, then an unknown throw. */
function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return `timed out: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return `connection error: ${err.message}`;
  if (err instanceof Anthropic.RateLimitError) return `rate limited: ${err.message}`;
  if (err instanceof Anthropic.AuthenticationError) return `authentication failed: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `api error (status ${String(err.status)}): ${err.message}`;
  if (err instanceof Error) return err.message;
  return `non-error throw: ${String(err)}`;
}

export interface ClaudeRationalizerOptions {
  /** Required — see `createClaudeRationalizerFromEnv` below for the
   *  env-var-driven, "absent key => no provider" wiring the CLI should
   *  actually use. This constructor fails loudly instead: a caller that
   *  reaches it has already decided to build a live provider, so a missing
   *  or empty key here is a programming error, not an expected "seam off"
   *  state. */
  readonly apiKey: string;
  /** Default `claude-haiku-4-5`; spec explicitly allows `claude-sonnet-5`. */
  readonly model?: string;
  /** See this file's header — DROP, not queue, over this cap. */
  readonly maxInFlight?: number;
  /** Per-request network timeout, milliseconds. */
  readonly timeoutMs?: number;
  /**
   * Test-only seam: inject a fake/mock `Anthropic` client so `submit` never
   * touches the network. Production callers omit this and get a real
   * `new Anthropic({ apiKey, timeout: timeoutMs })`.
   */
  readonly client?: AnthropicMessagesClient;
}

/**
 * Builds the real, network-backed `Rationalizer`. Throws synchronously if
 * `opts.apiKey` is empty — see the field doc above for why that is the
 * right failure mode for THIS constructor (use
 * `createClaudeRationalizerFromEnv` for the "maybe there's no key, that's
 * fine" case).
 */
export function createClaudeRationalizer(opts: ClaudeRationalizerOptions): Rationalizer {
  if (opts.apiKey.trim() === "") {
    throw new Error("createClaudeRationalizer: apiKey must not be empty");
  }
  const model = opts.model ?? DEFAULT_MODEL;
  const maxInFlight = opts.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, timeout: timeoutMs });

  let mailbox: RationalizerResult[] = [];
  let inFlightCount = 0;

  function deliver(result: RationalizerResult): void {
    mailbox.push(result);
  }

  async function run(request: RationalizerRequest): Promise<void> {
    try {
      const message = await client.messages.create(
        {
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserContent(request) }],
          output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
        },
        { timeout: timeoutMs },
      );
      const textBlock = message.content.find((block): block is Anthropic.TextBlock => block.type === "text");
      if (textBlock === undefined) {
        deliver({ request, response: null, error: "provider returned no text block" });
        return;
      }
      // Parsed as `unknown` and handed over verbatim — see this file's
      // header. A body that parses but doesn't match RESPONSE_SCHEMA's
      // intent (wrong types, an out-of-range index, extra fields) is NOT
      // corrected here; it reaches the sim's validator exactly as received.
      let parsed: unknown;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        deliver({ request, response: null, error: `provider text block was not valid JSON: ${textBlock.text.slice(0, 200)}` });
        return;
      }
      deliver({ request, response: parsed });
    } catch (err) {
      deliver({ request, response: null, error: describeError(err) });
    } finally {
      inFlightCount--;
    }
  }

  return {
    name: "claude",
    submit(request: RationalizerRequest): void {
      if (inFlightCount >= maxInFlight) {
        deliver({ request, response: null, error: `dropped: at concurrency cap (${maxInFlight} in flight)` });
        return;
      }
      inFlightCount++;
      // Fire-and-forget by design (see this file's header) — `run`'s own
      // try/catch/finally guarantees this promise never rejects, so there
      // is nothing for a caller to await or catch here.
      void run(request);
    },
    poll(): readonly RationalizerResult[] {
      const batch = mailbox;
      mailbox = [];
      return batch;
    },
  };
}

export interface ClaudeRationalizerFromEnvOptions {
  /** Defaults to `ANTHROPIC_API_KEY`. */
  readonly apiKeyEnvVar?: string;
  readonly model?: string;
  readonly maxInFlight?: number;
  readonly timeoutMs?: number;
  readonly client?: AnthropicMessagesClient;
}

/**
 * The factory the CLI should actually wire in (see this task's handoff).
 * Reads the API key from the environment and returns `null` — NOT a
 * throwing, half-broken provider — when it is absent or empty, so "the flag
 * is on but there's no key" degrades to "seam stays off" instead of a crash
 * at startup. Chosen over throwing because the whole seam is opt-in
 * (`HollowSimOptions.rationalizer` is an optional field the CLI sets only
 * when it has something to put there); a `Rationalizer | null` factory lets
 * the wiring read as `const r = createClaudeRationalizerFromEnv(); if (r)
 * simOptions.rationalizer = r;` with no try/catch required, consistent with
 * every other "off by default" knob in this tool (see `env.ts`'s optional
 * `PERSONA_SEED`/`INTERVENTION_LOG` pattern).
 */
export function createClaudeRationalizerFromEnv(opts: ClaudeRationalizerFromEnvOptions = {}): Rationalizer | null {
  const envVar = opts.apiKeyEnvVar ?? "ANTHROPIC_API_KEY";
  const apiKey = process.env[envVar];
  if (apiKey === undefined || apiKey.trim() === "") return null;
  return createClaudeRationalizer({
    apiKey,
    ...(opts.model !== undefined ? { model: opts.model } : {}),
    ...(opts.maxInFlight !== undefined ? { maxInFlight: opts.maxInFlight } : {}),
    ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts.client !== undefined ? { client: opts.client } : {}),
  });
}
