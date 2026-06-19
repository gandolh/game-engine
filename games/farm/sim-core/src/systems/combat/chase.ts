

import type { SimContext, System, World, MessageBus } from "@engine/core";
import type { GameEntity } from "../../components";
import { isWithinReach } from "../proximity";
import { ONT_COMBAT, type ChallengeBody } from "../../protocols/combat";
import { pursuitWindowTicks } from "./constants";
import type { CombatSystem } from "./system";

export class ChaseSystem implements System {
  readonly name = "ChaseSystem";

  private readonly pursuitWindow: number;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
    private readonly combat: CombatSystem,
    ticksPerDay: number,
  ) {
    this.pursuitWindow = pursuitWindowTicks(ticksPerDay);
  }

  run(ctx: SimContext): void {
    for (const chaser of this.world.query("farmer", "transform", "intentions")) {
      const chase = chaser.farmer?.chaseTarget;
      if (!chase || chaser.id === undefined) continue;

      if (this.combat.isFighting(chaser.id)) {
        delete chaser.farmer!.chaseTarget;
        continue;
      }

      if (ctx.tick - chase.startTick >= this.pursuitWindow) {
        this.endChase(chaser);
        continue;
      }

      const target = this.findFarmer(chase.peerId);
      if (!target || !target.transform) {
        this.endChase(chaser);
        continue;
      }

      if (isWithinReach(chaser.transform, Math.round(target.transform.x), Math.round(target.transform.y))) {
        if (this.combat.canFight(chaser.id, chase.peerId)) {
          const body: ChallengeBody = { challengerId: chaser.id, context: "street" };
          this.bus.send(
            {
              performative: "request",
              ontology: ONT_COMBAT.CHALLENGE,
              sender: chaser.id,
              recipient: chase.peerId,
              body: body as unknown as Record<string, unknown>,
            },
            ctx.tick,
          );
        }
        this.endChase(chaser);
        continue;
      }

      this.repathToward(chaser, target);
      this.markFleeing(target, chaser.id, ctx.tick);
    }
  }

  private repathToward(chaser: GameEntity, target: GameEntity): void {
    const tx = Math.round(target.transform!.x);
    const ty = Math.round(target.transform!.y);
    const queue = chaser.intentions!.queue;
    const front = queue[0];
    const isChaseTravel =
      front?.kind === "travel" && front.data.chasePursuit === true;
    if (isChaseTravel) {
      const t = front.data.targetTile as { x: number; y: number } | undefined;
      if (t && t.x === tx && t.y === ty) return; 

      delete chaser.farmer!.path;
      queue.shift();
    }
    queue.unshift({
      kind: "travel",
      data: { targetTile: { x: tx, y: ty }, chasePursuit: true },
      priority: -1, 
    });
  }

  private markFleeing(target: GameEntity, chaserId: number, tick: number): void {
    if (!target.farmer) return;
    target.farmer.fleeingFrom = { peerId: chaserId, untilTick: tick + this.pursuitWindow };
  }

  private endChase(chaser: GameEntity): void {
    if (!chaser.farmer) return;
    delete chaser.farmer.chaseTarget;
    const queue = chaser.intentions?.queue;
    if (queue && queue[0]?.kind === "travel" && queue[0].data.chasePursuit === true) {
      queue.shift();
      delete chaser.farmer.path;
    }
  }

  private findFarmer(id: number): GameEntity | undefined {
    for (const f of this.world.query("farmer")) {
      if (f.id === id) return f;
    }
    return undefined;
  }
}
