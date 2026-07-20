/**
 * Component-level tests for chunk hollow-12a's `HollowGovernanceSystem`,
 * exercising the real production class directly over a hand-built World
 * (mirroring `community/dynamics.test.ts`'s harness pattern) — this lets
 * each scenario engineer a specific trust/genome/inventory configuration
 * without the villager deliberator's own need-driven movement (and the
 * ambient ONE-tick trust decay/accrual that comes with it) muddying the
 * exact mechanism under test. See `../sim-bootstrap.governance.test.ts` for
 * the full-sim-level wiring + determinism tests.
 *
 * A harness "step" mirrors `sim-bootstrap.ts`'s real per-tick order for the
 * systems it wires: `governance.run(ctx)` (and, for the norm-clash
 * describe block, `community.run(ctx)` immediately after — the real
 * GOVERNANCE-then-COMMUNITY stage order), then `bus.flush()` +
 * `bus.notifySubscribers()` — so a message an ONT_SOCIAL emitter sends
 * BEFORE calling `step()` is only visible to the governance pass inside the
 * FOLLOWING `step()` call, the same one-tick lag production has (see
 * governance-system.ts's header).
 */
import { describe, it, expect } from "vitest";
import { World, MessageBus, type SimContext } from "@engine/core";
import { makeNeed, relationshipScore, PERFORMATIVE, UNIT_TRUST_SCALE } from "@engine/core/agent";
import type { HollowEntity, Genome } from "../components";
import { NEED_BELONGING, GOOD_MATERIALS } from "../economy";
import {
  ONT_GOVERNANCE,
  ONT_SOCIAL,
  ONT_COMMUNITY,
  type LeaderChangedBody,
  type NormChangedBody,
  type SanctionedBody,
} from "../protocols";
import { CommunityRegistry, HollowCommunitySystem } from "../community";
import { HollowGovernanceSystem, type GovernanceSystemOptions } from "./governance-system";

type Agent = HollowEntity & { id: number };

function makeGenome(overrides: Partial<Record<string, number>> = {}): Genome {
  return {
    behavior: {
      sociability: 0.5,
      risk: 0.5,
      aggression: 0.5,
      loyalty: 0.5,
      greed: 0.5,
      industriousness: 0.5,
      curiosity: 0.5,
      ...overrides,
    },
    aptitude: { food: 0.5, material: 0.5 },
    appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" },
  };
}

function spawnAgent(
  world: World<HollowEntity>,
  genome: Genome,
  opts: { goods?: Record<string, number> } = {},
): Agent {
  const e = world.spawn({
    agent: { gx: 0, gy: 0, moveTarget: null },
    needs: { byKind: { [NEED_BELONGING]: makeNeed({ value: 50, decayPerTick: 0 }) } },
    inventory: { goods: { ...opts.goods } },
    intentions: { queue: [] },
    relationships: { byId: new Map() },
    communityId: null,
    genome,
  } satisfies HollowEntity);
  return e as Agent;
}

/** Sets `from`'s ledger entry TOWARD `to` (i.e. "how much `from` trusts
 *  `to`") — `relationshipScore(to.relationships, from.id)` reads the
 *  opposite direction ("how much `to` trusts `from`"); tests set whichever
 *  direction(s) the scenario needs explicitly, never both by accident. */
function setTrust(from: Agent, to: Agent, value: number): void {
  from.relationships!.byId.set(to.id, value);
}

interface RecordedEvent {
  ontology: string;
  body: Record<string, unknown>;
}

function makeGovernanceHarness(opts?: GovernanceSystemOptions) {
  const world = new World<HollowEntity>();
  const bus = new MessageBus();
  const registry = new CommunityRegistry();
  const governance = new HollowGovernanceSystem(world, registry, bus, { intervalTicks: 1, ...opts });
  const events: RecordedEvent[] = [];
  for (const ontology of Object.values(ONT_GOVERNANCE)) {
    bus.subscribeOntology(ontology, (msg) => events.push({ ontology: msg.ontology, body: msg.body }));
  }
  let tick = 0;
  return {
    world,
    registry,
    events,
    /** Queues an ONT_SOCIAL message — visible to governance's tallies only
     *  from the NEXT `step()` onward (see this file's header). */
    emitSocial(ontology: string, body: Record<string, unknown>): void {
      bus.send({ performative: PERFORMATIVE.INFORM, ontology, sender: "world", recipient: "broadcast", body }, tick);
    },
    step(): void {
      const ctx: SimContext = { tick };
      governance.run(ctx);
      bus.flush();
      bus.notifySubscribers();
      tick++;
    },
    run(n: number): void {
      for (let i = 0; i < n; i++) this.step();
    },
  };
}

describe("HollowGovernanceSystem — standing + leader (sub-pass a)", () => {
  it("leadership is contestable: the leader identity actually changes as standing shifts, and LEADER_CHANGED fires each time", () => {
    const h = makeGovernanceHarness();
    const a = spawnAgent(h.world, makeGenome());
    const b = spawnAgent(h.world, makeGenome());
    const c = spawnAgent(h.world, makeGenome());
    const community = h.registry.form([a.id, b.id, c.id], [], 0);

    // Everyone trusts A highly -> A should take the lead first pass.
    setTrust(b, a, 0.9);
    setTrust(c, a, 0.9);
    h.step();
    expect(h.registry.get(community.id)!.leaderId).toBe(a.id);
    const firstLeaderChanged = h.events.filter((e) => e.ontology === ONT_GOVERNANCE.LEADER_CHANGED);
    expect(firstLeaderChanged.length).toBe(1);
    expect((firstLeaderChanged[0]!.body as unknown as LeaderChangedBody).newLeaderId).toBe(a.id);
    expect((firstLeaderChanged[0]!.body as unknown as LeaderChangedBody).previousLeaderId).toBeNull();

    // Now everyone trusts B even more -> leadership must flip to B.
    setTrust(a, b, 0.99);
    setTrust(c, b, 0.99);
    h.step();
    expect(h.registry.get(community.id)!.leaderId).toBe(b.id);
    const secondLeaderChanged = h.events.filter((e) => e.ontology === ONT_GOVERNANCE.LEADER_CHANGED);
    expect(secondLeaderChanged.length).toBe(2);
    expect((secondLeaderChanged[1]!.body as unknown as LeaderChangedBody).newLeaderId).toBe(b.id);
    expect((secondLeaderChanged[1]!.body as unknown as LeaderChangedBody).previousLeaderId).toBe(a.id);
  });

  it("standing is stored on the community, keyed by agent id", () => {
    const h = makeGovernanceHarness();
    const a = spawnAgent(h.world, makeGenome());
    const b = spawnAgent(h.world, makeGenome());
    const c = spawnAgent(h.world, makeGenome());
    const community = h.registry.form([a.id, b.id, c.id], [], 0);
    h.step();
    const standing = h.registry.get(community.id)!.standing;
    expect(Object.keys(standing).map(Number).sort((x, y) => x - y)).toEqual([a.id, b.id, c.id]);
  });
});

describe("HollowGovernanceSystem — votable norms (sub-pass b)", () => {
  it("a greedy/individualist-majority community drifts shareRate DOWN from its default, with NORM_CHANGED events", () => {
    const h = makeGovernanceHarness();
    const members = [
      spawnAgent(h.world, makeGenome({ greed: 0.95, loyalty: 0.05 })),
      spawnAgent(h.world, makeGenome({ greed: 0.95, loyalty: 0.05 })),
      spawnAgent(h.world, makeGenome({ greed: 0.95, loyalty: 0.05 })),
    ];
    const community = h.registry.form(
      members.map((m) => m.id),
      [],
      0,
    );
    const initialShareRate = community.norms.shareRate;
    h.run(10);
    const finalShareRate = h.registry.get(community.id)!.norms.shareRate;

    expect(finalShareRate).toBeLessThan(initialShareRate);
    const normChanges = h.events.filter(
      (e) => e.ontology === ONT_GOVERNANCE.NORM_CHANGED && (e.body as unknown as NormChangedBody).norm === "shareRate",
    );
    expect(normChanges.length).toBeGreaterThan(0);
    for (const e of normChanges) {
      const body = e.body as unknown as NormChangedBody;
      expect(body.newValue).toBeLessThan(body.oldValue);
    }
  });

  it("a loyal/unselfish-majority community drifts shareRate UP from its default, with NORM_CHANGED events — opposite direction from the greedy scenario", () => {
    const h = makeGovernanceHarness();
    const members = [
      spawnAgent(h.world, makeGenome({ loyalty: 0.95, greed: 0.05 })),
      spawnAgent(h.world, makeGenome({ loyalty: 0.95, greed: 0.05 })),
      spawnAgent(h.world, makeGenome({ loyalty: 0.95, greed: 0.05 })),
    ];
    const community = h.registry.form(
      members.map((m) => m.id),
      [],
      0,
    );
    const initialShareRate = community.norms.shareRate;
    h.run(10);
    const finalShareRate = h.registry.get(community.id)!.norms.shareRate;

    expect(finalShareRate).toBeGreaterThan(initialShareRate);
    const normChanges = h.events.filter(
      (e) => e.ontology === ONT_GOVERNANCE.NORM_CHANGED && (e.body as unknown as NormChangedBody).norm === "shareRate",
    );
    expect(normChanges.length).toBeGreaterThan(0);
    for (const e of normChanges) {
      const body = e.body as unknown as NormChangedBody;
      expect(body.newValue).toBeGreaterThan(body.oldValue);
    }
  });
});

describe("HollowGovernanceSystem — sanctions (sub-pass c)", () => {
  it("a member hoarding goods under a high shareRate is fined (goods move to the stockpile) and loses fellow-member trust, with a SANCTIONED event", () => {
    const h = makeGovernanceHarness();
    const hoarder = spawnAgent(h.world, makeGenome(), { goods: { [GOOD_MATERIALS]: 100 } });
    const b = spawnAgent(h.world, makeGenome());
    const c = spawnAgent(h.world, makeGenome());
    const community = h.registry.form([hoarder.id, b.id, c.id], [], 0);
    // A high shareRate + zero recorded contribution is exactly the
    // "holding goods while contributing below the norm" hoarding signal.
    community.norms.shareRate = 0.8;

    expect(relationshipScore(b.relationships, hoarder.id)).toBe(UNIT_TRUST_SCALE.neutral);

    h.step();

    const sanctioned = h.events.filter((e) => e.ontology === ONT_GOVERNANCE.SANCTIONED);
    expect(sanctioned.length).toBe(1);
    const body = sanctioned[0]!.body as unknown as SanctionedBody;
    expect(body.agentId).toBe(hoarder.id);
    expect(body.action).toBe("fined");
    expect(body.finedAmount).toBeGreaterThan(0);
    expect(body.trustPenalty).toBeGreaterThan(0);

    // Real effects, not just the event: goods actually moved...
    const remaining = hoarder.inventory!.goods[GOOD_MATERIALS] ?? 0;
    expect(remaining).toBeLessThan(100);
    expect(remaining).toBeCloseTo(100 - body.finedAmount, 6);
    const stockpiled = h.registry.get(community.id)!.stockpile[GOOD_MATERIALS] ?? 0;
    expect(stockpiled).toBeCloseTo(body.finedAmount, 6);
    // ...and every fellow member's trust toward the violator actually dropped.
    expect(relationshipScore(b.relationships, hoarder.id)).toBeLessThan(UNIT_TRUST_SCALE.neutral);
    expect(relationshipScore(c.relationships, hoarder.id)).toBeLessThan(UNIT_TRUST_SCALE.neutral);
  });

  it("a severe antisocial act (attack) against a fellow member results in EXCLUSION (a real membership change), not just a fine", () => {
    const h = makeGovernanceHarness();
    const attacker = spawnAgent(h.world, makeGenome());
    const victim = spawnAgent(h.world, makeGenome());
    const bystander = spawnAgent(h.world, makeGenome());
    const community = h.registry.form([attacker.id, victim.id, bystander.id], [], 0);
    // `aggregateViolations` only counts an act toward standing/sanctions when
    // actor and target currently share a community (see governance-system.ts) —
    // `registry.form` builds the `Community.members` roster but does not
    // itself touch each entity's own `communityId` field, so the harness sets
    // it explicitly (mirrors what `HollowCommunitySystem`'s FORM/GROW passes
    // do for real in the full sim).
    for (const a of [attacker, victim, bystander]) a.communityId = community.id;

    h.emitSocial(ONT_SOCIAL.ATTACK, { actorId: attacker.id, targetId: victim.id, lethal: false, tick: 0 });
    h.step(); // delivers the queued ATTACK into the tally; governance.run() this step still predates delivery
    h.step(); // this pass now sees the tallied violation and sanctions it

    const sanctioned = h.events.filter((e) => e.ontology === ONT_GOVERNANCE.SANCTIONED);
    expect(sanctioned.length).toBeGreaterThan(0);
    const last = sanctioned[sanctioned.length - 1]!.body as unknown as SanctionedBody;
    expect(last.agentId).toBe(attacker.id);
    expect(last.action).toBe("excluded");
    expect(h.registry.get(community.id)!.members).not.toContain(attacker.id);
    expect(attacker.communityId).toBeNull();
  });
});

describe("HollowGovernanceSystem + HollowCommunitySystem — norm-clash drives a REAL defection (sub-pass d)", () => {
  it("a member whose genome strongly clashes with the community's actual norm has its outgoing trust eroded, and the EXISTING community LEAVE pass genuinely removes them once trust collapses", () => {
    const world = new World<HollowEntity>();
    const bus = new MessageBus();
    const registry = new CommunityRegistry();
    const governance = new HollowGovernanceSystem(world, registry, bus, { intervalTicks: 1 });
    const community = new HollowCommunitySystem(world, registry, bus, { checkIntervalTicks: 1 });
    const communityEvents: RecordedEvent[] = [];
    for (const ontology of Object.values(ONT_COMMUNITY)) {
      bus.subscribeOntology(ontology, (msg) => communityEvents.push({ ontology: msg.ontology, body: msg.body }));
    }

    const greedy = spawnAgent(world, makeGenome({ greed: 0.95, loyalty: 0.05 }));
    const loyalists = [
      spawnAgent(world, makeGenome({ loyalty: 0.95, greed: 0.05 })),
      spawnAgent(world, makeGenome({ loyalty: 0.95, greed: 0.05 })),
      spawnAgent(world, makeGenome({ loyalty: 0.95, greed: 0.05 })),
    ];
    const all = [greedy, ...loyalists];
    const c = registry.form(
      all.map((a) => a.id).sort((x, y) => x - y),
      [],
      0,
    );
    // A high shareRate the loyal majority is comfortable with but the
    // greedy minority strongly clashes against (the brief's own example).
    c.norms.shareRate = 0.5;
    // Every pair starts safely inside the community (well above both the
    // FORM/JOIN trust threshold and the LEAVE floor).
    for (const x of all) {
      for (const y of all) {
        if (x === y) continue;
        setTrust(x, y, 0.75);
      }
    }

    let tick = 0;
    const step = (): void => {
      const ctx: SimContext = { tick };
      governance.run(ctx);
      community.run(ctx);
      bus.flush();
      bus.notifySubscribers();
      tick++;
    };
    for (let i = 0; i < 8; i++) step();

    const finalMembers = registry.get(c.id)!.members;
    expect(finalMembers).not.toContain(greedy.id);
    expect(greedy.communityId).toBeNull();
    // The loyal majority is still intact, together — a FACTIONAL split (the
    // outlier peels off), not the whole community collapsing.
    for (const loyalist of loyalists) {
      expect(finalMembers).toContain(loyalist.id);
    }
    expect(communityEvents.some((e) => e.ontology === ONT_COMMUNITY.LEFT && e.body["agentId"] === greedy.id)).toBe(
      true,
    );
  });
});
