/**
 * `RationalizerSeam` (chunk hollow-13) — the small stateful harness that
 * sits between Hollow's deliberation and a `Rationalizer` provider, and the
 * ONLY thing in the sim that ever touches model output.
 *
 * Everything it does is arranged so that the sim's behavior with the seam
 * present is a superset of the sim's behavior without it, never a different
 * shape:
 *
 *   tick T   `consider` is reached with a candidate set. No answer is
 *            waiting, the policy gate says this decision is worth a call, so
 *            a request goes out via `submit`. The agent acts on its BDI
 *            DEFAULT this tick — the sim never waits.
 *   tick T+k `drain` polls the provider and parks whatever arrived. The next
 *            time that agent deliberates, `consider` validates the parked
 *            answer against the LIVE candidate set and either adopts an
 *            in-range index or falls back to the BDI default.
 *
 * So the worst case for every failure mode — no answer, a late answer, a
 * provider error, a malformed body, an out-of-range index, an answer whose
 * option set the world has moved past — is identical: the BDI default runs,
 * which is what would have happened with the seam off.
 *
 * ── budget ────────────────────────────────────────────────────────────────
 * `maxInFlight` caps concurrent consultations across the whole population
 * (the spec's "30-60 agents x event-triggered is modest but not free"), and
 * `requestTimeoutTicks` expires both unanswered requests and unclaimed
 * answers so neither map can grow with the dead.
 *
 * ── two sites, one seam (hollow-17) ───────────────────────────────────────
 * `consider` is the social site: a deliberating agent's social verb.
 * `considerVote` is the governance site: a community leader's own vote on
 * the `shareRate` norm, at a governance pass. Both run the same anchoring and
 * the same budget. Their maps are keyed by site and agent, so a leader with a
 * social consultation in flight can still be asked about their vote, and
 * neither answer can be claimed by the other site. A governance answer lives
 * for two governance intervals; the social default (50 ticks) would race the
 * 50-tick pass that claims it.
 *
 * ── determinism ───────────────────────────────────────────────────────────
 * No `Rng`, no clock. The two `Map`s are only ever read BY KEY (site + agent or community id) and
 * written/deleted by key; the one place they are iterated is expiry pruning,
 * where the set of deletions is the same whatever the iteration order, so
 * `Map` ordering never reaches sim output. With a deterministic provider
 * (the stub) the whole seam is deterministic; with a live model it is
 * explicitly the spec's "non-deterministic live mode".
 */
import type { ScoredChoice } from "../agents/social-verbs";
import type { HollowDeliberationContext } from "../agents/registry";
import type { SocialAgent } from "../agents/social-verbs";
import type { Community } from "../community";
import { buildRationalizerRequest, buildVoteRequest, type ConsultedAgent, type VoterView } from "./request";
import { isSignificantDecision } from "./policy";
import { validateRationalizerResult, type AnchorOptions, type RationalizerRejectionReason } from "./validate";
import type { Rationalizer, RationalizerRequest, RationalizerResult, RationalizerSite } from "./types";

/** Ticks after which an unanswered request is abandoned and an unclaimed
 *  answer is dropped. Also the garbage collector for agents that died
 *  mid-consultation. */
export const DEFAULT_REQUEST_TIMEOUT_TICKS = 50;

/** Concurrent consultations allowed across the whole population. */
export const DEFAULT_MAX_IN_FLIGHT = 8;

/** Hard cap on the undrained decision log, so a host that never calls
 *  `drainDecisions` cannot grow memory without bound. Oldest are dropped
 *  first and counted. */
export const DEFAULT_MAX_DECISION_LOG = 4096;

export interface RationalizerSeamOptions {
  readonly requestTimeoutTicks?: number;
  readonly maxInFlight?: number;
  readonly maxDecisionLog?: number;
  /**
   * Passed straight to the anchoring validator: also require the whole
   * candidate set (scores included) to be unchanged since the request, not
   * just the chosen option to still be on the table. OFF by default — see
   * `validate.ts`'s `AnchorOptions.strictCandidateSet` for why turning it on
   * makes the seam reject essentially everything in this sim.
   */
  readonly strictCandidateSet?: boolean;
}

/**
 * What happened to one consultation, at the tick it resolved. This is the
 * "stated vs revealed reasoning" record the spec wants in the chronicle —
 * `rationale` is what the model SAID, `chosenKind` is what the sim then
 * actually did.
 */
export interface RationalizerDecision {
  /** Tick the answer was resolved on (not the tick it was requested). */
  readonly tick: number;
  /** Which decision this was — see `RationalizerSite`. */
  readonly site: RationalizerSite;
  readonly agentId: number;
  readonly requestTick: number;
  readonly provider: string;
  /**
   * - `adopted`       — a legal index, different from the BDI default: the
   *                     model actually changed the sim's behavior.
   * - `kept-default`  — a legal index that happens to BE the BDI default.
   * - `declined`      — an explicit `choiceIndex: null`.
   * - `rejected`      — anchoring refused it; `reason` says why.
   */
  readonly outcome: "adopted" | "kept-default" | "declined" | "rejected";
  readonly reason: RationalizerRejectionReason | null;
  /** The model's stated reason, or `""` for a rejected/errored answer. */
  readonly rationale: string;
  /** Verb the substrate would have taken. */
  readonly bdiKind: string;
  /** Verb actually taken (equal to `bdiKind` for every outcome but `adopted`). */
  readonly chosenKind: string;
}

/** What `consider` is handed. A record rather than positional args because
 *  chunk 4's provider harness calls it too, and four positional params of
 *  which two are arrays is a footgun. */
export interface ConsiderInput {
  readonly agent: SocialAgent;
  readonly ctx: HollowDeliberationContext;
  /** The live candidate set — `enumerateSocialActions`'s output, non-empty. */
  readonly candidates: readonly ScoredChoice[];
  /** `bestCandidateIndex(candidates)` — a valid index into it. */
  readonly bdiChoiceIndex: number;
}

/**
 * What `considerVote` is handed: a leader at a governance pass, choosing how
 * to cast their own vote on a norm. See corpus/wiki/decisions.md → Hollow —
 * the LLM-rationalizer seam (hollow-17) for why this decision and why the
 * leader.
 */
export interface ConsiderVoteInput {
  readonly leader: ConsultedAgent;
  readonly community: Community;
  /** The community's members, ascending by id. */
  readonly members: readonly VoterView[];
  readonly tick: number;
  /** The leader's possible votes — never empty. */
  readonly candidates: readonly ScoredChoice[];
  /** The substrate's own vote: the leader's genome-implied preference. */
  readonly bdiChoiceIndex: number;
  /** The governance pass's significance gate: would the norm move this pass? */
  readonly live: boolean;
  /** Facts the stance candidates do not carry (norm, current value, size). */
  readonly decision: Readonly<Record<string, number | string>>;
  /** How long the request, or its unclaimed answer, survives. */
  readonly timeoutTicks: number;
}

interface InFlight {
  readonly request: RationalizerRequest;
  readonly timeoutTicks: number;
}

interface Parked {
  readonly result: RationalizerResult;
  readonly timeoutTicks: number;
}

/** One key space per site, so the two sites can never claim each other's answers. */
function keyOf(site: RationalizerSite, id: number): string {
  return `${site}:${id}`;
}

/**
 * The key a request is parked under. A social answer belongs to the agent who
 * deliberates; a governance vote belongs to the COMMUNITY, so a new leader
 * claims (and the anchoring check rejects, because `leaderId` is part of each
 * vote's identity) an answer reasoned by the previous one, instead of it
 * expiring unseen.
 */
function requestKey(request: RationalizerRequest): string {
  return request.site === "governance-vote"
    ? keyOf(request.site, request.standing.communityId ?? -1)
    : keyOf(request.site, request.agentId);
}

export class RationalizerSeam {
  private readonly requestTimeoutTicks: number;
  private readonly maxInFlight: number;
  private readonly maxDecisionLog: number;
  private readonly anchorOptions: AnchorOptions;

  /** site:agentId → the request currently awaiting an answer. */
  private readonly inFlight = new Map<string, InFlight>();
  /** site:agentId → an answer that arrived but has not been claimed since. */
  private readonly arrived = new Map<string, Parked>();
  private decisions: RationalizerDecision[] = [];
  private droppedDecisions = 0;
  private lastDrainedTick = -1;

  constructor(
    private readonly provider: Rationalizer,
    opts: RationalizerSeamOptions = {},
  ) {
    this.requestTimeoutTicks = opts.requestTimeoutTicks ?? DEFAULT_REQUEST_TIMEOUT_TICKS;
    this.maxInFlight = opts.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT;
    this.maxDecisionLog = opts.maxDecisionLog ?? DEFAULT_MAX_DECISION_LOG;
    this.anchorOptions = { strictCandidateSet: opts.strictCandidateSet ?? false };
  }

  get providerName(): string {
    return this.provider.name;
  }

  /** In-flight consultations right now — for budget assertions and the CLI's
   *  run summary. */
  get inFlightCount(): number {
    return this.inFlight.size;
  }

  /**
   * Collects everything the provider has finished since the last call and
   * parks it for the owning agent's next deliberation, then expires anything
   * too old. Called ONCE per tick by `HollowDeliberateSystem.run`, BEFORE
   * deliberation, so an answer that landed between ticks is visible this
   * tick rather than next.
   *
   * Idempotent per tick: a second call for the same tick is a no-op, so an
   * extra wiring point can never double-drain the provider.
   */
  drain(tick: number): void {
    if (tick === this.lastDrainedTick) return;
    this.lastDrainedTick = tick;

    for (const result of this.provider.poll()) {
      const key = requestKey(result.request);
      const timeoutTicks = this.inFlight.get(key)?.timeoutTicks ?? this.requestTimeoutTicks;
      this.inFlight.delete(key);
      // Last answer wins: if two answers for one agent somehow arrive in the
      // same batch, the later one was computed against the newer request.
      this.arrived.set(key, { result, timeoutTicks });
    }

    this.expire(tick);
  }

  /** Drops timed-out requests and unclaimed answers (also the garbage
   *  collector for agents that died mid-consultation — a dead agent never
   *  deliberates again, so its entry would otherwise be immortal). */
  private expire(tick: number): void {
    for (const [key, entry] of this.inFlight) {
      if (entry.request.tick < tick - entry.timeoutTicks) this.inFlight.delete(key);
    }
    for (const [key, entry] of this.arrived) {
      if (entry.result.request.tick >= tick - entry.timeoutTicks) continue;
      this.arrived.delete(key);
      // A social answer still expires silently, as before hollow-17, so the
      // social figures stay comparable with hollow-16's. A governance answer
      // is recorded: see `RationalizerRejectionReason`'s "expired".
      const request = entry.result.request;
      if (request.site === "governance-vote") {
        const bdiKind = request.candidates[request.bdiChoiceIndex]?.kind ?? "";
        this.record({
          tick,
          site: request.site,
          agentId: request.agentId,
          requestTick: request.tick,
          provider: this.provider.name,
          outcome: "rejected",
          reason: "expired",
          rationale: "",
          bdiKind,
          chosenKind: bdiKind,
        });
      }
    }
  }

  /**
   * THE DECISION POINT. Returns the `ScoredChoice` the agent should act on —
   * always an element of `input.candidates`, never anything else.
   *
   * It does at most two things: claim a parked answer (validating it against
   * the live set first), and/or issue a new request. Both are optional; the
   * return value defaults to `candidates[bdiChoiceIndex]` and only ever
   * differs when an answer passed every anchoring check.
   */
  consider(input: ConsiderInput): ScoredChoice {
    const { agent, ctx, candidates, bdiChoiceIndex } = input;
    return this.decide({
      site: "social",
      agentId: agent.id,
      tick: ctx.tick,
      candidates,
      bdiChoiceIndex,
      key: keyOf("social", agent.id),
      significant: () => isSignificantDecision(candidates),
      build: () => buildRationalizerRequest(agent, ctx, candidates, bdiChoiceIndex),
      timeoutTicks: this.requestTimeoutTicks,
    });
  }

  /**
   * The governance site (hollow-17): returns the vote the leader casts —
   * always an element of `input.candidates`. Same contract as `consider`:
   * claim a parked answer if there is one, otherwise maybe ask, and default
   * to the substrate's own vote.
   */
  considerVote(input: ConsiderVoteInput): ScoredChoice {
    const { leader, community, members, tick, candidates, bdiChoiceIndex, decision } = input;
    return this.decide({
      site: "governance-vote",
      agentId: leader.id,
      tick,
      candidates,
      bdiChoiceIndex,
      key: keyOf("governance-vote", community.id),
      significant: () => input.live,
      build: () => buildVoteRequest(leader, community, members, candidates, bdiChoiceIndex, tick, decision),
      timeoutTicks: input.timeoutTicks,
    });
  }

  private decide(args: {
    readonly site: RationalizerSite;
    readonly agentId: number;
    readonly tick: number;
    readonly candidates: readonly ScoredChoice[];
    readonly bdiChoiceIndex: number;
    readonly key: string;
    readonly significant: () => boolean;
    readonly build: () => RationalizerRequest;
    readonly timeoutTicks: number;
  }): ScoredChoice {
    const { candidates, bdiChoiceIndex } = args;
    const bdi = candidates[bdiChoiceIndex];
    // Defensive: a caller that hands over an empty set (or a bad index) gets
    // the substrate's own answer back, never a crash mid-tick.
    if (!bdi) return candidates[0]!;

    const key = args.key;
    const parked = this.arrived.get(key);
    if (parked !== undefined) {
      this.arrived.delete(key);
      return this.applyAnswer(parked.result, args.tick, candidates, bdiChoiceIndex, bdi);
    }

    if (!this.inFlight.has(key) && this.inFlight.size < this.maxInFlight && args.significant()) {
      const request = args.build();
      this.inFlight.set(key, { request, timeoutTicks: args.timeoutTicks });
      this.provider.submit(request);
    }

    return bdi;
  }

  /** Validates one parked answer against the LIVE candidate set and records
   *  what happened. Never throws; every failure path returns `bdi`. */
  private applyAnswer(
    result: RationalizerResult,
    tick: number,
    candidates: readonly ScoredChoice[],
    bdiChoiceIndex: number,
    bdi: ScoredChoice,
  ): ScoredChoice {
    // Validated against the LIVE set, so an accepted `choiceIndex` has
    // already been re-resolved by option identity and indexes `candidates`
    // directly — see validate.ts's header.
    const outcome = validateRationalizerResult(result, result.request.agentId, candidates, this.anchorOptions);

    if (!outcome.accepted) {
      this.record({
        tick,
        site: result.request.site,
        agentId: result.request.agentId,
        requestTick: result.request.tick,
        provider: this.provider.name,
        outcome: "rejected",
        reason: outcome.reason,
        rationale: "",
        bdiKind: bdi.kind,
        chosenKind: bdi.kind,
      });
      return bdi;
    }

    // AGREEMENT IS NOT AN INSTRUCTION. If the model named the very option the
    // request presented as the substrate's own default, it did not override
    // anything — it concurred. That must leave the CURRENT default running,
    // never resurrect the option that was the default back at request time.
    //
    // The distinction is load-bearing here because an answer always lands
    // late: Hollow's 40-tick social cooldown means an agent's next social
    // deliberation is ~2 in-game days after the one that prompted the call, by
    // which point the substrate's preference has usually moved. Treating a
    // late "I agree" as an instruction would let a two-day-old concurrence
    // outrank a fresh valuation — and would make even the echo-the-default
    // stub visibly change the run, which is exactly the leakage the seam is
    // supposed to be incapable of.
    const agreedWithSubstrate =
      outcome.choiceIndex === null ||
      (outcome.offeredIndex !== null &&
        outcome.offeredIndex !== undefined &&
        outcome.offeredIndex === result.request.bdiChoiceIndex);

    if (agreedWithSubstrate) {
      this.record({
        tick,
        site: result.request.site,
        agentId: result.request.agentId,
        requestTick: result.request.tick,
        provider: this.provider.name,
        outcome: outcome.choiceIndex === null ? "declined" : "kept-default",
        reason: null,
        rationale: outcome.rationale,
        bdiKind: bdi.kind,
        chosenKind: bdi.kind,
      });
      return bdi;
    }

    // A genuine override: the model picked something OTHER than the default it
    // was shown, and that option is still on the table. Guaranteed in range by
    // the validator, which re-resolved it against this exact array.
    const chosen = candidates[outcome.choiceIndex]!;
    this.record({
      tick,
      site: result.request.site,
      agentId: result.request.agentId,
      requestTick: result.request.tick,
      provider: this.provider.name,
      outcome: outcome.choiceIndex === bdiChoiceIndex ? "kept-default" : "adopted",
      reason: null,
      rationale: outcome.rationale,
      bdiKind: bdi.kind,
      chosenKind: chosen.kind,
    });
    return chosen;
  }

  private record(decision: RationalizerDecision): void {
    if (this.decisions.length >= this.maxDecisionLog) {
      this.decisions.shift();
      this.droppedDecisions++;
    }
    this.decisions.push(decision);
  }

  /**
   * Hands over every decision recorded since the last call and clears the
   * log. This is the seam chunk 3's chronicle logging reads — the sim itself
   * never looks at it, so a host that never drains loses nothing but memory
   * (bounded by `maxDecisionLog`).
   */
  drainDecisions(): readonly RationalizerDecision[] {
    const batch = this.decisions;
    this.decisions = [];
    return batch;
  }

  /** Decisions dropped by the `maxDecisionLog` cap over the whole run —
   *  cumulative, never reset, so "was anything lost?" always has an answer. */
  get droppedDecisionCount(): number {
    return this.droppedDecisions;
  }
}
