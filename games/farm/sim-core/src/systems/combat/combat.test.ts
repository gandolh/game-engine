import { describe, it, expect, beforeEach } from "vitest";
import { World, createRng, MessageBus } from "@engine/core";
import type { GameEntity, CropKind } from "../../components";
import { CombatSystem } from "./system";
import { ONT_SIMULATION } from "../../protocols/simulation";
import { ONT_COMBAT } from "../../protocols/combat";
import { RING_STAKE_GOLD } from "./constants";

const ZERO: Record<CropKind, number> = {
  radish: 0, wheat: 0, carrot: 0, tomato: 0, corn: 0, pumpkin: 0, grape: 0, "winter-squash": 0,
};

function makeFighter(
  world: World<GameEntity>,
  opts: { gold?: number; hp?: number; ap?: number; hasBat?: boolean; crops?: Partial<Record<CropKind, number>> } = {},
): GameEntity {
  return world.spawn({
    farmer: { name: "F", currentRegion: "village", ...(opts.hasBat ? { hasBat: true } : {}) },
    fsm: { current: "WAIT_DAY", enteredTick: 0 },
    inbox: { messages: [] },
    trust: { byId: new Map<number, number>() },
    health: { current: opts.hp ?? 40, max: 40 },
    ap: { current: opts.ap ?? 100, max: 100, penaltyPending: false, penaltyCapacity: 50, away: false },
    inventory: { gold: opts.gold ?? 100, crops: { ...ZERO, ...opts.crops }, seeds: { ...ZERO } },
  });
}

function newCombat(world: World<GameEntity>, seed = 1): { combat: CombatSystem; bus: MessageBus } {
  const bus = new MessageBus();
  const combat = new CombatSystem(world, bus, createRng(seed), 50);
  return { combat, bus };
}

function runToEnd(combat: CombatSystem, a: GameEntity, b: GameEntity, startTick = 0): number {
  let tick = startTick;
  while ((combat.isFighting(a.id!) || combat.isFighting(b.id!)) && tick < 1000) {
    combat.run({ tick });
    tick++;
  }
  return tick;
}

describe("CombatSystem — bout lifecycle", () => {
  let world: World<GameEntity>;

  beforeEach(() => {
    world = new World<GameEntity>();
  });

  it("startBout flips both fighters to FIGHTING and freezes them", () => {
    const a = makeFighter(world);
    const b = makeFighter(world);
    const { combat } = newCombat(world);
    expect(combat.startBout(a.id!, b.id!, "ring", 0)).toBe(true);
    expect(a.fsm!.current).toBe("FIGHTING");
    expect(b.fsm!.current).toBe("FIGHTING");
    expect(combat.isFighting(a.id!)).toBe(true);
  });

  it("a ring bout resolves to a KO and releases both fighters", () => {
    const a = makeFighter(world);
    const b = makeFighter(world);
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);
    runToEnd(combat, a, b);

    expect(combat.isFighting(a.id!)).toBe(false);
    expect(a.fsm!.current).toBe("WAIT_DAY");
    expect(b.fsm!.current).toBe("WAIT_DAY");

    expect(a.health!.current).toBe(a.health!.max);
    expect(b.health!.current).toBe(b.health!.max);
  });

  it("ring stake: 10g moves loser → winner (gold delta is ±10 total)", () => {
    const a = makeFighter(world, { gold: 100 });
    const b = makeFighter(world, { gold: 100 });
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);
    runToEnd(combat, a, b);
    const total = a.inventory!.gold + b.inventory!.gold;
    expect(total).toBe(200); 
    expect(Math.abs(a.inventory!.gold - 100)).toBe(RING_STAKE_GOLD);
  });

  it("ring bout raises mutual trust (de-escalation)", () => {
    const a = makeFighter(world);
    const b = makeFighter(world);
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);
    runToEnd(combat, a, b);
    expect(a.trust!.byId.get(b.id!)!).toBeGreaterThan(0.5);
    expect(b.trust!.byId.get(a.id!)!).toBeGreaterThan(0.5);
  });

  it("ring AP-out: a fighter with no AP loses immediately", () => {
    const a = makeFighter(world, { ap: 0 });   
    const b = makeFighter(world, { ap: 100 });
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);
    runToEnd(combat, a, b);

    expect(b.inventory!.gold).toBe(110);
    expect(a.inventory!.gold).toBe(90);
  });

  // ---------------------------------------------------------------------
  // audit-46 — mutual exhaustion is a DRAW, not a loss for the initiator.
  //
  // Ring fights are AP-bound, not HP-bound: at ticksPerDay=1200 a swing costs 2 AP every 24
  // ticks against a 100-point pool, while FIST_DAMAGE is 4..9 against 100 HP — so a fist bout
  // runs out of AP long before anyone is knocked out. Two farmers entering with equal AP (the
  // normal state at the start of a day phase) alternate swings and hit zero on the SAME
  // interval. `resolveExhaustion` is entered when EITHER side is out, and the ring branch
  // assumed exactly one was: `aOut = !aCanSwing` made `a` — always `bout.aId`, the INITIATOR —
  // the loser. Over a 100-day run that is a systematic gold drain on whichever personality
  // starts ring fights, plus a stream of fabricated win/loss records.
  // ---------------------------------------------------------------------
  it("ring mutual exhaustion is a DRAW — no gold moves", () => {
    // Both one swing from empty: each spends AP_PER_SWING.fist = 2 and hits zero together.
    const a = makeFighter(world, { gold: 100, ap: 2, hp: 40 });
    const b = makeFighter(world, { gold: 100, ap: 2, hp: 40 });
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);
    runToEnd(combat, a, b);

    expect(combat.isFighting(a.id!)).toBe(false);
    expect(a.inventory!.gold).toBe(100); // was 90 — the initiator paid the stake for a draw
    expect(b.inventory!.gold).toBe(100); // was 110
  });

  it("ring mutual exhaustion applies NO trust delta to either ledger", () => {
    const a = makeFighter(world, { ap: 2 });
    const b = makeFighter(world, { ap: 2 });
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);
    runToEnd(combat, a, b);

    // A fabricated RING_TRUST_BOND on both ledgers is the other half of the damage.
    expect(a.trust!.byId.has(b.id!)).toBe(false);
    expect(b.trust!.byId.has(a.id!)).toBe(false);
  });

  it("ring mutual exhaustion broadcasts a result with NO winner and NO loser", () => {
    const a = makeFighter(world, { ap: 2 });
    const b = makeFighter(world, { ap: 2 });
    const { combat, bus } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);
    runToEnd(combat, a, b);

    bus.flush();
    const results = bus.drain().filter((m) => m.ontology === ONT_COMBAT.RESULT);
    expect(results.length).toBe(1);
    const body = results[0]!.body as unknown as { context: string; winnerId: number | null; loserId: number | null; koed: boolean };
    expect(body.context).toBe("ring"); // still a ring result, not relabelled as a street one
    expect(body.winnerId).toBeNull();
    expect(body.loserId).toBeNull();
    expect(body.koed).toBe(false);
  });

  it("ring mutual exhaustion still heals both fighters and releases them", () => {
    // The ring's heal is its CONSENSUAL-SPARRING contract ("nobody leaves the ring maimed"),
    // not part of the win/loss settlement — so it survives a draw. Without this, drawing would
    // be strictly worse than losing, which the ring never intended.
    const a = makeFighter(world, { ap: 2, hp: 12 });
    const b = makeFighter(world, { ap: 2, hp: 12 });
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);
    runToEnd(combat, a, b);

    expect(a.health!.current).toBe(a.health!.max);
    expect(b.health!.current).toBe(b.health!.max);
    expect(a.fsm!.current).toBe("WAIT_DAY");
    expect(b.fsm!.current).toBe("WAIT_DAY");
  });

  it("ONE-SIDED exhaustion is UNTOUCHED — winner, stake and trust bond all still apply", () => {
    // The path the ring branch was actually written for. This must not move.
    const a = makeFighter(world, { gold: 100, ap: 0 });
    const b = makeFighter(world, { gold: 100, ap: 100 });
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);
    runToEnd(combat, a, b);

    expect(b.inventory!.gold).toBe(100 + RING_STAKE_GOLD);
    expect(a.inventory!.gold).toBe(100 - RING_STAKE_GOLD);
    expect(a.trust!.byId.get(b.id!)).toBeGreaterThan(0.5);
    expect(b.trust!.byId.get(a.id!)).toBeGreaterThan(0.5);
  });

  it("bat fighter deals more damage and tends to win vs fists (low HP target)", () => {
    const a = makeFighter(world, { hasBat: true });
    const b = makeFighter(world, { hp: 10 });
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);
    runToEnd(combat, a, b);
    expect(a.inventory!.gold).toBe(110); 
  });
});

describe("CombatSystem — street fights", () => {
  let world: World<GameEntity>;
  beforeEach(() => { world = new World<GameEntity>(); });

  it("street KO: victor loots up to 3 goods units (no gold)", () => {
    const a = makeFighter(world, { gold: 100 });
    const b = makeFighter(world, { hp: 6, gold: 100, crops: { wheat: 10 } });
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "street", 0);
    runToEnd(combat, a, b);

    expect(a.inventory!.crops.wheat).toBe(3);
    expect(b.inventory!.crops.wheat).toBe(7);
    expect(a.inventory!.gold).toBe(100);
    expect(b.inventory!.gold).toBe(100);
  });

  it("street HP is NOT reset at bout end (only at day start)", () => {
    const a = makeFighter(world);
    const b = makeFighter(world, { hp: 6 });
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "street", 0);
    runToEnd(combat, a, b);

    expect(b.health!.current).toBe(0);
    expect(a.health!.current).toBeLessThanOrEqual(a.health!.max);
  });

  it("day-start message resets HP to full", () => {
    const a = makeFighter(world, { hp: 5 });
    const { combat } = newCombat(world);
    a.inbox!.messages.push({
      performative: "inform",
      ontology: ONT_SIMULATION.DAY_START,
      sender: "world",
      body: { day: 1, daysRemaining: 99 },
      tickIssued: 0,
    } as never);
    combat.run({ tick: 0 });
    expect(a.health!.current).toBe(a.health!.max);
  });
});

describe("CombatSystem — ring teleport + handshake + governors", () => {
  let world: World<GameEntity>;
  beforeEach(() => { world = new World<GameEntity>(); });

  function withTransform(f: GameEntity, x: number, y: number, region: string): GameEntity {
    f.transform = { x, y, prevX: x, prevY: y, rotation: 0 };
    f.farmer!.currentRegion = region as never;
    return f;
  }

  function pushChallenge(target: GameEntity, challengerId: number, context: "ring" | "street"): void {
    target.inbox!.messages.push({
      performative: "request",
      ontology: ONT_COMBAT.CHALLENGE,
      sender: challengerId,
      body: { challengerId, context },
      tickIssued: 0,
    } as never);
  }

  it("a ring bout teleports both fighters out and restores them after", () => {
    const a = withTransform(makeFighter(world), 10, 10, "village");
    const b = withTransform(makeFighter(world), 20, 20, "farm-cora");
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "ring", 0);

    expect(a.farmer!.currentRegion).toBe("ring");
    expect(b.farmer!.currentRegion).toBe("ring");
    runToEnd(combat, a, b);

    expect(a.transform!.x).toBe(10);
    expect(a.transform!.y).toBe(10);
    expect(a.farmer!.currentRegion).toBe("village");
    expect(b.transform!.x).toBe(20);
    expect(b.farmer!.currentRegion).toBe("farm-cora");
  });

  it("a street bout does NOT teleport", () => {
    const a = withTransform(makeFighter(world), 10, 10, "village");
    const b = withTransform(makeFighter(world, { hp: 6 }), 11, 10, "village");
    const { combat } = newCombat(world);
    combat.startBout(a.id!, b.id!, "street", 0);
    runToEnd(combat, a, b);
    expect(a.transform!.x).toBe(10);
    expect(a.farmer!.currentRegion).toBe("village");
  });

  it("CHALLENGE in an inbox starts a bout", () => {
    const a = makeFighter(world);
    const b = makeFighter(world);
    const { combat } = newCombat(world);
    pushChallenge(b, a.id!, "ring");
    combat.run({ tick: 0 });
    expect(combat.isFighting(a.id!)).toBe(true);
  });

  it("governor: a pair can't re-fight within the cooldown window", () => {
    const a = makeFighter(world);
    const b = makeFighter(world);
    const { combat } = newCombat(world);
    pushChallenge(b, a.id!, "ring");
    combat.run({ tick: 0 });
    runToEnd(combat, a, b, 1);

    expect(combat.canFight(a.id!, b.id!)).toBe(false);
  });

  it("governor: daily initiation cap", () => {
    const a = makeFighter(world);
    const b = makeFighter(world);
    const c = makeFighter(world);
    const { combat } = newCombat(world);

    pushChallenge(b, a.id!, "ring");
    combat.run({ tick: 0 });
    runToEnd(combat, a, b, 1);
    pushChallenge(c, a.id!, "ring");
    combat.run({ tick: 50 });
    runToEnd(combat, a, c, 51);

    const d = makeFighter(world);
    expect(combat.canFight(a.id!, d.id!)).toBe(false);
  });
});

describe("CombatSystem — street witness trust penalties", () => {
  let world: World<GameEntity>;
  beforeEach(() => { world = new World<GameEntity>(); });

  function inRegion(f: GameEntity, region: string): GameEntity {
    f.farmer!.currentRegion = region as never;
    return f;
  }

  it("a same-region witness loses trust toward the street initiator (and extra on loot)", () => {
    const attacker = inRegion(makeFighter(world), "village");
    const victim = inRegion(makeFighter(world, { hp: 6, crops: { wheat: 5 } }), "village");
    const witness = inRegion(makeFighter(world), "village");
    const elsewhere = inRegion(makeFighter(world), "farm-cora");
    const { combat } = newCombat(world);

    combat.startBout(attacker.id!, victim.id!, "street", 0);
    runToEnd(combat, attacker, victim);

    const wTrust = witness.trust!.byId.get(attacker.id!)!;
    expect(wTrust).toBeLessThan(0.5);

    expect(elsewhere.trust!.byId.get(attacker.id!) ?? 0.5).toBe(0.5);

    expect(wTrust).toBeLessThan(0.5 - 0.08);
  });
});

describe("CombatSystem — determinism", () => {
  it("same seed → identical bout outcome", () => {
    function play(seed: number): { aGold: number; bGold: number } {
      const w = new World<GameEntity>();
      const a = makeFighter(w, { gold: 100 });
      const b = makeFighter(w, { gold: 100 });
      const { combat } = newCombat(w, seed);
      combat.startBout(a.id!, b.id!, "ring", 0);
      runToEnd(combat, a, b);
      return { aGold: a.inventory!.gold, bGold: b.inventory!.gold };
    }
    expect(play(42)).toEqual(play(42));
  });
});
