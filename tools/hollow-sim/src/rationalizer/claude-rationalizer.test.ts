/**
 * The real Claude-backed `Rationalizer` (hollow-13, chunk 4).
 *
 * ZERO NETWORK CALLS in this suite — every test injects a mock
 * `AnthropicMessagesClient`, and `noNetworkGuard` below additionally stubs
 * `globalThis.fetch` to throw if anything in this file ever reaches it, so
 * a future test that forgets to inject a mock fails loudly instead of
 * quietly making a real (billed) request.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { validateRationalizerResponse, type RationalizerRequest } from "@hollow/sim-core/rationalize";
import {
  createClaudeRationalizer,
  createClaudeRationalizerFromEnv,
  DEFAULT_MODEL,
  DEFAULT_MAX_IN_FLIGHT,
  type AnthropicMessagesClient,
} from "./claude-rationalizer";

// ── no-network guard, for the whole file ──────────────────────────────────
let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("network access is forbidden in this test suite — inject a mock client instead");
  });
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

// ── fixtures ───────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<RationalizerRequest> = {}): RationalizerRequest {
  return {
    agentId: 1,
    tick: 100,
    genome: {
      behavior: { greed: 0.5, aggression: 0.2, risk: 0.3, loyalty: 0.4, sociability: 0.5, curiosity: 0.2, industriousness: 0.6 },
      aptitude: { food: 0.5, material: 0.4 },
      appearance: { height: 1, build: 1, skinTone: "skinLight", hairTone: "hairBlack" },
    },
    beliefs: { starving: false },
    needs: { food: 0.8, wealth: 0.5 },
    relationships: [],
    standing: { communityId: null, memberCount: 0, standing: null, isLeader: false },
    candidates: [
      { index: 0, kind: "idle", data: {}, score: 0.1 },
      { index: 1, kind: "gift", data: { targetId: 2, good: "food", amount: 3 }, score: 0.4 },
    ],
    bdiChoiceIndex: 0,
    candidateFingerprint: "fp-test",
    ...overrides,
  };
}

/** A minimal, valid `Anthropic.Message` carrying a single text block. Only
 *  the fields this file actually reads (`content[].type`/`.text`) matter;
 *  the rest of the SDK's `Message` shape is asserted away via `unknown` so
 *  this fixture doesn't have to track every field the SDK adds over time. */
function fakeMessage(text: string): Anthropic.Message {
  return {
    id: "msg_test",
    content: [{ type: "text", text, citations: null }],
    model: DEFAULT_MODEL,
    role: "assistant",
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message",
    usage: { input_tokens: 10, output_tokens: 10 },
  } as unknown as Anthropic.Message;
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drains pending microtasks AND the macrotask the mocked promise settles
 *  on, so an awaited `submit` -> `client.messages.create` -> `deliver` chain
 *  has fully landed in the mailbox before the test polls it. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeClient(create: AnthropicMessagesClient["messages"]["create"]): AnthropicMessagesClient {
  return { messages: { create } };
}

// ── tests ────────────────────────────────────────────────────────────────

describe("createClaudeRationalizer", () => {
  it("throws synchronously on an empty API key (fail loudly at construction)", () => {
    expect(() => createClaudeRationalizer({ apiKey: "" })).toThrow(/apiKey/);
    expect(() => createClaudeRationalizer({ apiKey: "   " })).toThrow(/apiKey/);
  });

  it("is named 'claude'", () => {
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", client: makeClient(vi.fn()) });
    expect(rationalizer.name).toBe("claude");
  });

  it("submit returns synchronously while the request is still in flight", () => {
    const { promise } = deferred<Anthropic.Message>();
    const create = vi.fn().mockReturnValue(promise);
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", client: makeClient(create) });

    const returned = rationalizer.submit(makeRequest());

    expect(returned).toBeUndefined(); // returns immediately, no await
    expect(create).toHaveBeenCalledTimes(1);
    expect(rationalizer.poll()).toEqual([]); // nothing delivered yet — still in flight
  });

  it("delivers a well-formed answer through poll once the request resolves", async () => {
    const create = vi.fn().mockResolvedValue(fakeMessage(JSON.stringify({ choiceIndex: 1, rationale: "the gift closes a debt" })));
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", client: makeClient(create) });
    const request = makeRequest();

    rationalizer.submit(request);
    await flush();
    const results = rationalizer.poll();

    expect(results).toHaveLength(1);
    expect(results[0]?.error).toBeUndefined();
    expect(results[0]?.request).toBe(request); // the harness's own object, echoed verbatim
    expect(results[0]?.response).toEqual({ choiceIndex: 1, rationale: "the gift closes a debt" });

    // sanity: the call actually used structured outputs + the default model
    const params = create.mock.calls[0]?.[0] as { model: string; output_config?: { format?: { type: string } } };
    expect(params.model).toBe(DEFAULT_MODEL);
    expect(params.output_config?.format?.type).toBe("json_schema");

    // and poll() only delivers once
    expect(rationalizer.poll()).toEqual([]);
  });

  it("passes a malformed answer through as unknown, unmodified — sim-core rejects it, this file does not", async () => {
    // Valid JSON, wrong shape (choiceIndex is a string) — a real model
    // deviating from the schema, or the schema being satisfied in a way
    // the sim's stricter validator still rejects.
    const create = vi.fn().mockResolvedValue(fakeMessage(JSON.stringify({ choiceIndex: "not-an-index", rationale: "oops" })));
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", client: makeClient(create) });

    rationalizer.submit(makeRequest());
    await flush();
    const [result] = rationalizer.poll();

    expect(result?.error).toBeUndefined();
    // Handed over verbatim — not coerced, not dropped, not "fixed up".
    expect(result?.response).toEqual({ choiceIndex: "not-an-index", rationale: "oops" });

    // Prove the downstream consequence: sim-core's OWN validator (owned by
    // @hollow/sim-core, never edited here) rejects this shape.
    const outcome = validateRationalizerResponse(result?.response, 2);
    expect(outcome.accepted).toBe(false);
    if (!outcome.accepted) expect(outcome.reason).toBe("malformed");
  });

  it("surfaces a typed SDK connection error as RationalizerResult.error, never a throw", async () => {
    const create = vi.fn().mockRejectedValue(new Anthropic.APIConnectionError({ message: "network down" }));
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", client: makeClient(create) });

    expect(() => rationalizer.submit(makeRequest())).not.toThrow();
    await flush();
    const [result] = rationalizer.poll();

    expect(result?.response).toBeNull();
    expect(result?.error).toMatch(/connection error/i);
    expect(result?.error).toMatch(/network down/);
  });

  it("surfaces a plain non-SDK throw as RationalizerResult.error too", async () => {
    const create = vi.fn().mockRejectedValue(new Error("something else broke"));
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", client: makeClient(create) });

    rationalizer.submit(makeRequest());
    await flush();
    const [result] = rationalizer.poll();

    expect(result?.response).toBeNull();
    expect(result?.error).toBe("something else broke");
  });

  it("surfaces an unparseable text body as a provider error, not a thrown exception", async () => {
    const create = vi.fn().mockResolvedValue(fakeMessage("not json at all"));
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", client: makeClient(create) });

    rationalizer.submit(makeRequest());
    await flush();
    const [result] = rationalizer.poll();

    expect(result?.response).toBeNull();
    expect(result?.error).toMatch(/not valid JSON/);
  });

  it("caps concurrent in-flight requests and DROPS (not queues) over the cap", () => {
    const { promise } = deferred<Anthropic.Message>(); // never resolves during this test
    const create = vi.fn().mockReturnValue(promise);
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", maxInFlight: 1, client: makeClient(create) });

    rationalizer.submit(makeRequest({ agentId: 1 }));
    rationalizer.submit(makeRequest({ agentId: 2 })); // over the cap of 1

    expect(create).toHaveBeenCalledTimes(1); // the second never reached the network at all

    const results = rationalizer.poll();
    expect(results).toHaveLength(1); // only the dropped one is settled yet
    expect(results[0]?.request.agentId).toBe(2);
    expect(results[0]?.error).toMatch(/dropped/);
    expect(results[0]?.error).toMatch(/1 in flight/);
  });

  it("frees a concurrency slot once a request settles", async () => {
    const create = vi.fn().mockResolvedValue(fakeMessage(JSON.stringify({ choiceIndex: null, rationale: "fine as-is" })));
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", maxInFlight: 1, client: makeClient(create) });

    rationalizer.submit(makeRequest({ agentId: 1 }));
    await flush(); // first request settles, freeing the slot
    rationalizer.poll();

    rationalizer.submit(makeRequest({ agentId: 2 })); // should NOT be dropped now
    expect(create).toHaveBeenCalledTimes(2);
    await flush();
    const results = rationalizer.poll();
    expect(results).toHaveLength(1);
    expect(results[0]?.error).toBeUndefined();
  });

  it("uses DEFAULT_MAX_IN_FLIGHT when no override is given", () => {
    expect(DEFAULT_MAX_IN_FLIGHT).toBeGreaterThan(0);
    const create = vi.fn().mockReturnValue(deferred<Anthropic.Message>().promise);
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", client: makeClient(create) });
    for (let i = 0; i < DEFAULT_MAX_IN_FLIGHT; i++) rationalizer.submit(makeRequest({ agentId: i }));
    expect(create).toHaveBeenCalledTimes(DEFAULT_MAX_IN_FLIGHT);

    rationalizer.submit(makeRequest({ agentId: 999 })); // one over
    expect(create).toHaveBeenCalledTimes(DEFAULT_MAX_IN_FLIGHT); // not called again
    const results = rationalizer.poll();
    expect(results).toHaveLength(1);
    expect(results[0]?.request.agentId).toBe(999);
  });

  it("respects a configurable model, e.g. claude-sonnet-5", async () => {
    const create = vi.fn().mockResolvedValue(fakeMessage(JSON.stringify({ choiceIndex: null, rationale: "ok" })));
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", model: "claude-sonnet-5", client: makeClient(create) });
    rationalizer.submit(makeRequest());
    await flush();
    const params = create.mock.calls[0]?.[0] as { model: string };
    expect(params.model).toBe("claude-sonnet-5");
  });

  it("never sends anything beyond what RationalizerRequest carries", async () => {
    const create = vi.fn().mockResolvedValue(fakeMessage(JSON.stringify({ choiceIndex: null, rationale: "ok" })));
    const rationalizer = createClaudeRationalizer({ apiKey: "test-key", client: makeClient(create) });
    const request = makeRequest();
    rationalizer.submit(request);
    await flush();

    const params = create.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    const sentText = params.messages[0]?.content ?? "";
    const sentPayload = JSON.parse(sentText) as Record<string, unknown>;
    // Only decision-relevant fields — no candidateFingerprint (a bookkeeping
    // hash), no agentId/tick (not needed for the choice itself).
    expect(Object.keys(sentPayload).sort()).toEqual(
      ["bdiDefaultIndex", "beliefs", "candidates", "genome", "needs", "relationships", "standing"].sort(),
    );
  });
});

describe("createClaudeRationalizerFromEnv", () => {
  const ENV_VAR = "HOLLOW_TEST_ANTHROPIC_KEY";
  const originalValue = process.env[ENV_VAR];

  afterEach(() => {
    if (originalValue === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = originalValue;
  });

  it("returns null when the env var is absent — not a throwing, half-broken provider", () => {
    delete process.env[ENV_VAR];
    const rationalizer = createClaudeRationalizerFromEnv({ apiKeyEnvVar: ENV_VAR });
    expect(rationalizer).toBeNull();
  });

  it("returns null when the env var is set but empty", () => {
    process.env[ENV_VAR] = "   ";
    const rationalizer = createClaudeRationalizerFromEnv({ apiKeyEnvVar: ENV_VAR });
    expect(rationalizer).toBeNull();
  });

  it("builds a real Rationalizer when the env var is present, injecting a mock client so nothing hits the network", () => {
    process.env[ENV_VAR] = "sk-ant-test-key";
    const create = vi.fn();
    const rationalizer = createClaudeRationalizerFromEnv({ apiKeyEnvVar: ENV_VAR, client: makeClient(create) });
    expect(rationalizer).not.toBeNull();
    expect(rationalizer?.name).toBe("claude");
  });
});
