// CombatSystem — owns all active bouts. While a farmer is in the FIGHTING FSM
// state, PerceiveSystem/DeliberateSystem/ActSystem skip it; this system advances
// each bout one swing-exchange per `swingInterval` ticks until it resolves, then
// releases both fighters back to WAIT_DAY (PerceiveSystem re-arms them next tick).
//
// Placement: ACT stage, AFTER ActSystem (so an act-tick that starts a bout this
// tick is resolved from here onward). Runs before FinishDaySystem.
//
// Determinism:
//   - Damage + street flee use rng.fork('fight:'+pairKey+':'+tick) — tick-derived,
//     never wall-clock / Math.random.
//   - Bouts are stored in a Map and iterated in insertion order; a per-tick snapshot
//     array is taken before mutation so ending a bout mid-loop is safe.
//   - HP day-start reset reads the DAY_START message (street recovery).

import type { SimContext, System, World, Rng, MessageBus } from "@engine/core";
import type { GameEntity } from "../../components";
import { applyTrustDelta } from "../trust";
import { ONT_SIMULATION } from "../../protocols/simulation";
import { ONT_COMBAT, type CombatContext, type CombatResultBody } from "../../protocols/combat";
import { getRegion, RING_REGION_ID } from "../../world/regions";
import {
  FIST_DAMAGE,
  BAT_DAMAGE,
  AP_PER_SWING,
  RING_STAKE_GOLD,
  RING_TRUST_BOND,
  STREET_FLEE_CHANCE,
  STREET_ATTACK_TRUST_PENALTY,
  STREET_LOOT_TRUST_PENALTY,
  FIGHT_COOLDOWN_DAYS,
  DAILY_FIGHT_CAP,
  swingIntervalTicks,
} from "./constants";
import { lootGoods } from "./loot";

interface ReturnSpot {
  x: number;
  y: number;
  region: string;
}

interface Bout {
  aId: number;
  bId: number;
  context: CombatContext;
  /** Who threw the first punch (the initiator) — used for street trust penalties. */
  initiatorId: number;
  nextSwingTick: number;
  /** Pre-bout positions to restore after a RING bout (combatants teleport to the ring and back). */
  returnA?: ReturnSpot;
  returnB?: ReturnSpot;
}

/** Stable ordered key for a pair (also the rng-fork label seed). */
function pairKey(a: number, b: number): string {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return `${lo}:${hi}`;
}

export class CombatSystem implements System {
  readonly name = "CombatSystem";

  private readonly bouts = new Map<string, Bout>();
  private readonly swingInterval: number;
  /** Current tick, set at the top of run() so endBout can stamp the RESULT message. */
  private currentTick = 0;
  /** Governor: day a pair last fought (ordered key → day). Blocks re-fights for FIGHT_COOLDOWN_DAYS. */
  private readonly lastFoughtDay = new Map<string, number>();
  /** Governor: fights a farmer has initiated today (id → count); reset at day start. */
  private readonly initiationsToday = new Map<number, number>();
  /** Latest day seen (from DAY_START), for cooldown math. */
  private currentDay = 0;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
    private readonly rng: Rng,
    ticksPerDay: number,
  ) {
    this.swingInterval = swingIntervalTicks(ticksPerDay);
  }

  /** True if either farmer is already in a bout (used by initiation to avoid double-booking). */
  isFighting(id: number): boolean {
    for (const b of this.bouts.values()) {
      if (b.aId === id || b.bId === id) return true;
    }
    return false;
  }

  /**
   * Begin a bout. Both fighters flip to FIGHTING; their normal day loop is frozen.
   * Returns false if either is missing, already fighting, or lacks HP/AP components.
   */
  startBout(
    initiatorId: number,
    targetId: number,
    context: CombatContext,
    tick: number,
  ): boolean {
    if (initiatorId === targetId) return false;
    if (this.isFighting(initiatorId) || this.isFighting(targetId)) return false;
    const a = this.findFarmer(initiatorId);
    const b = this.findFarmer(targetId);
    if (!a || !b || !a.health || !b.health || !a.fsm || !b.fsm) return false;

    a.fsm.current = "FIGHTING";
    b.fsm.current = "FIGHTING";
    const key = pairKey(initiatorId, targetId);
    const bout: Bout = {
      aId: initiatorId,
      bId: targetId,
      context,
      initiatorId,
      nextSwingTick: tick + this.swingInterval,
    };
    // Ring bouts teleport both combatants onto the ring island; street fights happen in place.
    if (context === "ring") {
      bout.returnA = this.teleportToRing(a, -1);
      bout.returnB = this.teleportToRing(b, +1);
    }
    this.bouts.set(key, bout);
    return true;
  }

  /** Move a fighter onto the ring (offset so the two stand apart). Returns its pre-bout spot. */
  private teleportToRing(f: GameEntity, dx: number): ReturnSpot {
    const ring = getRegion(RING_REGION_ID).center;
    const prev: ReturnSpot = {
      x: f.transform?.x ?? ring.x,
      y: f.transform?.y ?? ring.y,
      region: f.farmer?.currentRegion ?? RING_REGION_ID,
    };
    if (f.transform) {
      f.transform.prevX = f.transform.x;
      f.transform.prevY = f.transform.y;
      f.transform.x = ring.x + dx;
      f.transform.y = ring.y;
    }
    if (f.farmer) f.farmer.currentRegion = RING_REGION_ID;
    return prev;
  }

  /** Restore a fighter to its pre-bout spot after a ring bout ends. */
  private teleportBack(f: GameEntity | undefined, spot: ReturnSpot | undefined): void {
    if (!f || !spot) return;
    if (f.transform) {
      f.transform.prevX = f.transform.x;
      f.transform.prevY = f.transform.y;
      f.transform.x = spot.x;
      f.transform.y = spot.y;
    }
    if (f.farmer) f.farmer.currentRegion = spot.region as typeof f.farmer.currentRegion;
  }

  run(ctx: SimContext): void {
    this.currentTick = ctx.tick;
    this.processDayStartReset();
    this.processChallenges(ctx.tick);
    // Snapshot bouts so ending one mid-iteration is safe.
    for (const bout of [...this.bouts.values()]) {
      this.stepBout(bout, ctx.tick);
    }
  }

  /**
   * Inbox CHALLENGE → accept (governors permitting) and start the bout. v1 accept
   * policy: always accept if governors pass (Pip auto-resolves too — no minigame).
   * Iterates farmers in stable world order; challenges per farmer in inbox order.
   */
  private processChallenges(tick: number): void {
    for (const target of this.world.query("farmer", "inbox")) {
      if (target.id === undefined) continue;
      for (const msg of target.inbox.messages) {
        if (msg.ontology !== ONT_COMBAT.CHALLENGE) continue;
        const body = msg.body as unknown as { challengerId: number; context: CombatContext };
        const challengerId = body.challengerId;
        if (typeof challengerId !== "number") continue;
        if (!this.canFight(challengerId, target.id)) continue;
        if (this.startBout(challengerId, target.id, body.context, tick)) {
          this.lastFoughtDay.set(pairKey(challengerId, target.id), this.currentDay);
          this.initiationsToday.set(challengerId, (this.initiationsToday.get(challengerId) ?? 0) + 1);
        }
      }
    }
  }

  /** Governors: per-pair 2-day cooldown + per-initiator daily cap. */
  canFight(initiatorId: number, targetId: number): boolean {
    if (this.isFighting(initiatorId) || this.isFighting(targetId)) return false;
    const last = this.lastFoughtDay.get(pairKey(initiatorId, targetId));
    if (last !== undefined && this.currentDay - last < FIGHT_COOLDOWN_DAYS) return false;
    if ((this.initiationsToday.get(initiatorId) ?? 0) >= DAILY_FIGHT_CAP) return false;
    return true;
  }

  /** Street recovery: HP back to full at day start (ring resets at bout end instead). */
  private processDayStartReset(): void {
    for (const f of this.world.query("inbox", "health")) {
      for (const msg of f.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          const body = msg.body as unknown as { day?: number };
          if (typeof body.day === "number" && body.day > this.currentDay) {
            this.currentDay = body.day;
            this.initiationsToday.clear();
          }
          f.health!.current = f.health!.max;
          break;
        }
      }
    }
  }

  private stepBout(bout: Bout, tick: number): void {
    if (tick < bout.nextSwingTick) return;
    const a = this.findFarmer(bout.aId);
    const b = this.findFarmer(bout.bId);
    if (!a || !b || !a.health || !b.health) {
      this.endBout(bout, { context: bout.context, winnerId: null, loserId: null, koed: false, fledId: null, looted: 0 });
      return;
    }

    const fork = this.rng.fork(`fight:${pairKey(bout.aId, bout.bId)}:${tick}`);

    // Street-only: either fighter may flee mid-brawl (no KO, no loot).
    if (bout.context === "street" && fork.nextFloat() < STREET_FLEE_CHANCE) {
      const fledId = fork.nextFloat() < 0.5 ? bout.aId : bout.bId;
      this.endBout(bout, { context: "street", winnerId: null, loserId: null, koed: false, fledId, looted: 0 });
      return;
    }

    const aCanSwing = this.swing(a, b, fork);
    // If A's swing already KO'd B, resolve before B swings back.
    if (b.health.current <= 0) {
      this.resolveKo(bout, a, b);
      return;
    }
    const bCanSwing = this.swing(b, a, fork);
    if (a.health.current <= 0) {
      this.resolveKo(bout, b, a);
      return;
    }

    // Neither KO'd this exchange — handle AP exhaustion per context.
    if (!aCanSwing || !bCanSwing) {
      this.resolveExhaustion(bout, a, b, aCanSwing, bCanSwing);
      return;
    }

    bout.nextSwingTick = tick + this.swingInterval;
  }

  /** Attacker swings at defender if it can afford the AP. Returns false if AP-starved (no swing). */
  private swing(attacker: GameEntity, defender: GameEntity, fork: Rng): boolean {
    const bat = attacker.farmer?.hasBat === true;
    const apCost = bat ? AP_PER_SWING.bat : AP_PER_SWING.fist;
    if (!attacker.ap || attacker.ap.current < apCost) return false;
    attacker.ap.current -= apCost;
    const dmg = bat
      ? fork.int(BAT_DAMAGE.lo, BAT_DAMAGE.hi)
      : fork.int(FIST_DAMAGE.lo, FIST_DAMAGE.hi);
    if (defender.health) defender.health.current = Math.max(0, defender.health.current - dmg);
    return true;
  }

  private resolveKo(bout: Bout, winner: GameEntity, loser: GameEntity): void {
    let looted = 0;
    if (bout.context === "ring") {
      this.applyRingOutcome(winner, loser);
    } else {
      looted = lootGoods(winner, loser); // street KO → victor loots goods
      this.applyWitnessPenalties(bout.initiatorId, loser, looted > 0);
    }
    this.endBout(bout, {
      context: bout.context,
      winnerId: winner.id ?? null,
      loserId: loser.id ?? null,
      koed: true,
      fledId: null,
      looted,
    });
  }

  /** AP-out resolution. Ring: the AP-starved fighter loses immediately. Street: mutual → forfeit; one-sided → other keeps swinging (so re-arm next swing). */
  private resolveExhaustion(
    bout: Bout,
    a: GameEntity,
    b: GameEntity,
    aCanSwing: boolean,
    bCanSwing: boolean,
  ): void {
    if (bout.context === "ring") {
      // First to run out of AP loses immediately (no draws in a committed match).
      const aOut = !aCanSwing;
      const winner = aOut ? b : a;
      const loser = aOut ? a : b;
      this.applyRingOutcome(winner, loser);
      this.endBout(bout, {
        context: "ring",
        winnerId: winner.id ?? null,
        loserId: loser.id ?? null,
        koed: false,
        fledId: null,
        looted: 0,
      });
      return;
    }
    // Street: both out → mutual forfeit (no KO, no loot). Only one out → keep going.
    if (!aCanSwing && !bCanSwing) {
      this.endBout(bout, { context: "street", winnerId: null, loserId: null, koed: false, fledId: null, looted: 0 });
      return;
    }
    bout.nextSwingTick += this.swingInterval; // one side keeps swinging next exchange
  }

  /** Ring stake + de-escalation + HP-to-full reset (AP spent stays spent). */
  private applyRingOutcome(winner: GameEntity, loser: GameEntity): void {
    if (winner.inventory && loser.inventory) {
      const stake = Math.min(RING_STAKE_GOLD, loser.inventory.gold);
      loser.inventory.gold -= stake;
      winner.inventory.gold += stake;
    }
    if (winner.id !== undefined && loser.id !== undefined) {
      applyTrustDelta(winner, loser.id, RING_TRUST_BOND);
      applyTrustDelta(loser, winner.id, RING_TRUST_BOND);
    }
    if (winner.health) winner.health.current = winner.health.max;
    if (loser.health) loser.health.current = loser.health.max;
  }

  /**
   * Every same-region witness (and the victim) loses trust toward the street-fight
   * initiator: a base attack penalty, plus an extra drop if the initiator also looted.
   * When a witness's trust toward the initiator falls below the rival cutoff, the
   * relationship axis (RivalrySystem) labels them a one-sided rival → they become
   * eligible to retaliate (chase-and-attack) via their own BDI. Iterates farmers in
   * stable world order. Pure trust math → deterministic.
   */
  private applyWitnessPenalties(initiatorId: number, victim: GameEntity, looted: boolean): void {
    const penalty = STREET_ATTACK_TRUST_PENALTY + (looted ? STREET_LOOT_TRUST_PENALTY : 0);
    const region = victim.farmer?.currentRegion;
    for (const w of this.world.query("farmer", "trust")) {
      if (w.id === undefined || w.id === initiatorId) continue;
      // The victim always reacts; other farmers only if they share the fight's region.
      const isVictim = w.id === victim.id;
      if (!isVictim && w.farmer?.currentRegion !== region) continue;
      applyTrustDelta(w, initiatorId, penalty);
    }
  }

  private endBout(bout: Bout, result: CombatResultBody): void {
    const a = this.findFarmer(bout.aId);
    const b = this.findFarmer(bout.bId);
    if (bout.context === "ring") {
      this.teleportBack(a, bout.returnA);
      this.teleportBack(b, bout.returnB);
    }
    if (a?.fsm) a.fsm.current = "WAIT_DAY";
    if (b?.fsm) b.fsm.current = "WAIT_DAY";
    this.bouts.delete(pairKey(bout.aId, bout.bId));
    this.bus.send(
      { performative: "inform", ontology: ONT_COMBAT.RESULT, sender: "world", recipient: "broadcast", body: result as unknown as Record<string, unknown> },
      this.currentTick,
    );
  }

  private findFarmer(id: number): GameEntity | undefined {
    for (const f of this.world.query("farmer")) {
      if (f.id === id) return f;
    }
    return undefined;
  }
}
