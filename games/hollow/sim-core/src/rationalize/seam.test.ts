/**
 * The LLM-rationalizer seam end-to-end (chunk hollow-13), driven through a
 * real `bootstrapHollowSim` — the canonical way to exercise Hollow sim
 * behavior (CLAUDE.md, "Tests").
 *
 * Four claims, in order of how much they matter:
 *
 *  1. OFF is OFF. A sim booted without `rationalizer` produces a
 *     bit-for-bit identical snapshot stream to one booted with the stub,
 *     because the stub echoes the substrate — and, more importantly, an
 *     OFF sim never constructs a seam at all. (The whole-sim version of this
 *     claim is the 3-seed byte-identical headless export diff in the chunk
 *     handoff; this is its in-repo guard.)
 *  2. The seam is NOT INERT. A stub that actually disagrees visibly changes
 *     the run — asserted explicitly, because a seam that silently never
 *     fires would pass claims 1, 3 and 4 perfectly.
 *  3. Every illegal answer is rejected and the BDI default is used. One test
 *     per rejection class, end-to-end this time rather than in the
 *     validator's unit fixture.
 *  4. ON with a deterministic provider stays deterministic.
 */
import { describe, it, expect } from "vitest";
import { bootstrapHollowSim, type HollowSimOptions } from "../sim-bootstrap";
import { createStubRationalizer } from "./stub";
import type { Rationalizer, RationalizerRequest, RationalizerResult } from "./types";
import type { RationalizerDecision, RationalizerSeamOptions } from "./seam";

/** A small, fast, socially-busy profile — the headless CLI's validated
 *  research profile shrunk to a unit-test budget (constrained hardware:
 *  small populations, short runs — CLAUDE.md). */
const PROFILE: HollowSimOptions = {
  seed: 1,
  population: 20,
  ticksPerDay: 20,
  childAdultTicks: 15,
  adultElderTicks: 200,
  oldAgeHazardBase: 0.006,
  oldAgeHazardPerTick: 0.0012,
  oldAgeHazardMax: 0.2,
  starvationDeathTicks: 120,
  pairbondTrustThreshold: 0.55,
  pairbondCompatThreshold: 0.2,
  pairbondProximityTiles: 12,
  birthWindowTicks: 20,
  birthChance: 0.6,
  birthFoodSecurityFraction: 0.3,
  gestationTicks: 10,
  birthPerCapitaFoodTarget: 6,
  foodNodeCount: 10,
  foodNodeMaxStock: 200,
  foodNodeRegenPerTick: 12,
};

const TICKS = 300;

interface RunOutput {
  /** One stringified snapshot per sampled tick — the comparable trace. */
  readonly trace: string;
  readonly decisions: readonly RationalizerDecision[];
}

function run(rationalizer?: Rationalizer, seamOptions?: RationalizerSeamOptions, ticks = TICKS): RunOutput {
  const sim = bootstrapHollowSim(
    rationalizer
      ? { ...PROFILE, rationalizer, ...(seamOptions ? { rationalizerOptions: seamOptions } : {}) }
      : { ...PROFILE },
  );
  const frames: string[] = [];
  const decisions: RationalizerDecision[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.tick();
    if (sim.rationalizer) decisions.push(...sim.rationalizer.drainDecisions());
    // Sampling every 10th tick keeps the compared string manageable while
    // still catching any divergence within a few ticks of where it starts.
    if (i % 10 === 0) frames.push(JSON.stringify(sim.getSnapshot()));
  }
  return { trace: frames.join("\n"), decisions };
}

function countBy(decisions: readonly RationalizerDecision[], key: "outcome" | "reason"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of decisions) {
    const value = String(d[key]);
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

/** A provider that answers `choiceIndex: 0` but ECHOES A DOCTORED REQUEST.
 *  A well-behaved provider hands the harness's own object straight back, so
 *  this is the only way to exercise the paths that distrust the echo —
 *  wrong-agent, and a smuggled-in option that never came from the substrate. */
function corruptingProvider(mutate: (req: RationalizerRequest) => RationalizerRequest): Rationalizer {
  let mailbox: RationalizerResult[] = [];
  return {
    name: "corrupting",
    submit(request) {
      mailbox.push({ request: mutate(request), response: { choiceIndex: 0, rationale: "doctored answer" } });
    },
    poll() {
      const batch = mailbox;
      mailbox = [];
      return batch;
    },
  };
}

describe("seam OFF (the default)", () => {
  it("a sim booted without `rationalizer` exposes no seam at all", () => {
    const sim = bootstrapHollowSim({ ...PROFILE });
    expect(sim.rationalizer).toBeNull();
  });
});

describe("seam ON with the stub", () => {
  const off = run();
  const on = run(createStubRationalizer());

  it("consults on real decisions — the seam is reached, not dead code", () => {
    // Guard against the "green tests, inert feature" failure mode: if this
    // is 0, every other assertion in this file is vacuous.
    expect(on.decisions.length).toBeGreaterThan(0);
    const outcomes = countBy(on.decisions, "outcome");
    // The stub echoes the BDI default, so answers that survive the trip land
    // as `kept-default`. Some are rejected as stale — the option set legitimately
    // moved on between request and answer — which is itself the seam working.
    expect((outcomes["kept-default"] ?? 0) + (outcomes["rejected"] ?? 0)).toBe(on.decisions.length);
    expect(outcomes["adopted"] ?? 0).toBe(0); // the stub never disagrees
  });

  it("only ever consults on SIGNIFICANT verbs (the policy gate holds in a real run)", () => {
    const significant = new Set(["steal", "sabotage", "attack", "rumor", "trade"]);
    // The BDI default of a consulted decision need not itself be significant
    // (the gate fires when a significant verb is anywhere ON THE TABLE), but
    // a run where NONE of them ever is would mean the gate never fired.
    expect(on.decisions.some((d) => significant.has(d.bdiKind) || significant.has(d.chosenKind))).toBe(true);
  });

  it("produces a run byte-identical to seam OFF", () => {
    expect(on.trace).toBe(off.trace);
  });

  it("is deterministic — same seed, same stub, same run", () => {
    expect(run(createStubRationalizer()).trace).toBe(on.trace);
  });

  it("carries a non-empty rationale on every accepted answer", () => {
    const accepted = on.decisions.filter((d) => d.outcome !== "rejected");
    expect(accepted.length).toBeGreaterThan(0);
    for (const d of accepted) expect(d.rationale.length).toBeGreaterThan(0);
  });
});

describe("anchoring — an ILLEGAL answer is rejected and the BDI default is used", () => {
  const off = run();

  it("out-of-range index (the 'propose an action outside the set' attempt)", () => {
    const hostile = createStubRationalizer({
      respond: (req) => ({ choiceIndex: req.candidates.length + 7, rationale: "attack everyone" }),
    });
    const on = run(hostile);
    expect(on.decisions.length).toBeGreaterThan(0);
    expect((countBy(on.decisions, "reason")["index-out-of-range"] ?? 0)).toBeGreaterThan(0);
    expect(on.trace).toBe(off.trace);
  });

  it("non-integer index", () => {
    const hostile = createStubRationalizer({ respond: () => ({ choiceIndex: 1.5, rationale: "half a verb" }) });
    const on = run(hostile);
    expect((countBy(on.decisions, "reason")["non-integer-index"] ?? 0)).toBeGreaterThan(0);
    expect(on.trace).toBe(off.trace);
  });

  it("wrong shape (prose instead of a structured answer)", () => {
    const hostile = createStubRationalizer({ respond: () => "I would steal from the miller." });
    const on = run(hostile);
    expect((countBy(on.decisions, "reason")["malformed"] ?? 0)).toBeGreaterThan(0);
    expect(on.trace).toBe(off.trace);
  });

  it("stale candidate set — strict whole-set matching rejects every late answer", () => {
    // The literal reading of "stale": the candidate set is not IDENTICAL to
    // the one the request was issued against. With `strictCandidateSet` every
    // answer in this sim is stale (trust decays every tick, so scores drift),
    // so this run proves the rejection path AND why the lenient
    // option-identity rule is the default — see validate.ts's header.
    const on = run(createStubRationalizer(), { strictCandidateSet: true });
    expect(on.decisions.length).toBeGreaterThan(0);
    expect(countBy(on.decisions, "reason")["stale-candidates"] ?? 0).toBe(on.decisions.length);
    expect(on.trace).toBe(off.trace);
  });

  it("stale option — a choice the substrate no longer offers is refused", () => {
    // The doctored request claims the model was offered a fabricated option
    // ("attack agent -1") and answers with it. There is no such candidate in
    // the live set, so it can never be adopted — a smuggled action cannot
    // enter the sim even through a lying provider.
    const on = run(
      corruptingProvider((req) => ({
        ...req,
        candidates: [{ index: 0, kind: "attack", data: { targetId: -1 }, score: 99 }],
        bdiChoiceIndex: 0,
      })),
    );
    expect(on.decisions.length).toBeGreaterThan(0);
    expect(countBy(on.decisions, "reason")["stale-candidates"] ?? 0).toBe(on.decisions.length);
    expect(on.trace).toBe(off.trace);
  });

  it("provider error (timeout / transport failure)", () => {
    const failing = createStubRationalizer({ failWith: () => "timeout" });
    const on = run(failing);
    expect((countBy(on.decisions, "reason")["provider-error"] ?? 0)).toBeGreaterThan(0);
    expect(on.trace).toBe(off.trace);
  });

  it("a wrong-agent answer never lands on the wrong agent", () => {
    // The provider answers every request as if it were for agent 999 — an
    // id the run may or may not have. The seam parks answers by the id in
    // the echoed request, so a mismatched one is refused at validation.
    const on = run(corruptingProvider((req) => ({ ...req, agentId: 999 })));
    const reasons = countBy(on.decisions, "reason");
    // Every recorded decision is a rejection (wrong-agent, or stale if that
    // phantom id's set never matches) — never an adoption.
    expect(countBy(on.decisions, "outcome")["adopted"] ?? 0).toBe(0);
    expect(Object.keys(reasons).every((r) => r !== "null")).toBe(true);
    expect(on.trace).toBe(off.trace);
  });
});

describe("the seam is live — a disagreeing stub really changes the run", () => {
  it("adopts a different candidate, and only ever one FROM the candidate set", () => {
    // Always pick the LAST candidate. Whenever that differs from the BDI
    // default, the sim must visibly diverge; whatever it picks must still be
    // a verb the substrate itself enumerated.
    const contrarian = createStubRationalizer({
      respond: (req) => ({ choiceIndex: req.candidates.length - 1, rationale: "I prefer the other one" }),
    });
    const on = run(contrarian);
    const outcomes = countBy(on.decisions, "outcome");
    expect(outcomes["adopted"] ?? 0).toBeGreaterThan(0);

    // Anchoring still holds for every adopted choice: the verb actually
    // taken is one the enumerated set offered.
    const enumerable = new Set(["steal", "sabotage", "attack", "rumor", "gift", "share", "help_labor", "teach", "trade"]);
    for (const d of on.decisions) expect(enumerable.has(d.chosenKind)).toBe(true);

    expect(on.trace).not.toBe(run().trace);
  });
});
