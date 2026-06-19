

import type { SimContext, System, World, Rng, MessageBus } from "@engine/core";
import type { GameEntity } from "../../components";
import { applyTrustDelta } from "../cognition/trust";
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

  initiatorId: number;
  nextSwingTick: number;

  returnA?: ReturnSpot;
  returnB?: ReturnSpot;
}

function pairKey(a: number, b: number): string {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return `${lo}:${hi}`;
}

export class CombatSystem implements System {
  readonly name = "CombatSystem";

  private readonly bouts = new Map<string, Bout>();
  private readonly swingInterval: number;

  private currentTick = 0;

  private readonly lastFoughtDay = new Map<string, number>();

  private readonly initiationsToday = new Map<number, number>();

  private currentDay = 0;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
    private readonly rng: Rng,
    ticksPerDay: number,
  ) {
    this.swingInterval = swingIntervalTicks(ticksPerDay);
  }

  isFighting(id: number): boolean {
    for (const b of this.bouts.values()) {
      if (b.aId === id || b.bId === id) return true;
    }
    return false;
  }

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

    if (context === "ring") {
      bout.returnA = this.teleportToRing(a, -1);
      bout.returnB = this.teleportToRing(b, +1);
    }
    this.bouts.set(key, bout);
    return true;
  }

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

    for (const bout of [...this.bouts.values()]) {
      this.stepBout(bout, ctx.tick);
    }
  }

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

  canFight(initiatorId: number, targetId: number): boolean {
    if (this.isFighting(initiatorId) || this.isFighting(targetId)) return false;
    const last = this.lastFoughtDay.get(pairKey(initiatorId, targetId));
    if (last !== undefined && this.currentDay - last < FIGHT_COOLDOWN_DAYS) return false;
    if ((this.initiationsToday.get(initiatorId) ?? 0) >= DAILY_FIGHT_CAP) return false;
    return true;
  }

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

    if (bout.context === "street" && fork.nextFloat() < STREET_FLEE_CHANCE) {
      const fledId = fork.nextFloat() < 0.5 ? bout.aId : bout.bId;
      this.endBout(bout, { context: "street", winnerId: null, loserId: null, koed: false, fledId, looted: 0 });
      return;
    }

    const aCanSwing = this.swing(a, b, fork);

    if (b.health.current <= 0) {
      this.resolveKo(bout, a, b);
      return;
    }
    const bCanSwing = this.swing(b, a, fork);
    if (a.health.current <= 0) {
      this.resolveKo(bout, b, a);
      return;
    }

    if (!aCanSwing || !bCanSwing) {
      this.resolveExhaustion(bout, a, b, aCanSwing, bCanSwing);
      return;
    }

    bout.nextSwingTick = tick + this.swingInterval;
  }

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
      looted = lootGoods(winner, loser); 
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

  private resolveExhaustion(
    bout: Bout,
    a: GameEntity,
    b: GameEntity,
    aCanSwing: boolean,
    bCanSwing: boolean,
  ): void {
    if (bout.context === "ring") {

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

    if (!aCanSwing && !bCanSwing) {
      this.endBout(bout, { context: "street", winnerId: null, loserId: null, koed: false, fledId: null, looted: 0 });
      return;
    }
    bout.nextSwingTick += this.swingInterval; 
  }

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

  private applyWitnessPenalties(initiatorId: number, victim: GameEntity, looted: boolean): void {
    const penalty = STREET_ATTACK_TRUST_PENALTY + (looted ? STREET_LOOT_TRUST_PENALTY : 0);
    const region = victim.farmer?.currentRegion;
    for (const w of this.world.query("farmer", "trust")) {
      if (w.id === undefined || w.id === initiatorId) continue;

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
