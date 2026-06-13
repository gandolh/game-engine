// ChaseSystem — drives street-fight pursuit. A farmer with `farmer.chaseTarget`
// pursues that rival: each tick it (re)issues a travel intent toward the rival's
// current tile, shows the hostile intent, and when it closes to within reach it
// fires a CHALLENGE(street) via the combat handshake. The target, on perceiving a
// chaser, gets a flee marker (TravelSystem already moves it via the issued path).
//
// Runs in the MOVE band BEFORE TravelSystem so the travel intent it sets is stepped
// the same tick. Pure: pursuit window is a fixed tick count (not wall-clock), target
// selection reads transforms in stable world order.

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

      // Already fighting (this chase succeeded, or another bout) → drop the chase.
      if (this.combat.isFighting(chaser.id)) {
        delete chaser.farmer!.chaseTarget;
        continue;
      }

      // Pursuit window expired → give up.
      if (ctx.tick - chase.startTick >= this.pursuitWindow) {
        this.endChase(chaser);
        continue;
      }

      const target = this.findFarmer(chase.peerId);
      if (!target || !target.transform) {
        this.endChase(chaser);
        continue;
      }

      // Close enough → challenge to a street fight and stop chasing.
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

      // Otherwise keep closing: (re)point a travel intent at the rival's current tile,
      // and mark the target as fleeing so it heads away.
      this.repathToward(chaser, target);
      this.markFleeing(target, chaser.id, ctx.tick);
    }
  }

  /** Ensure the chaser's front intent is a travel toward the rival's live tile. */
  private repathToward(chaser: GameEntity, target: GameEntity): void {
    const tx = Math.round(target.transform!.x);
    const ty = Math.round(target.transform!.y);
    const queue = chaser.intentions!.queue;
    const front = queue[0];
    const isChaseTravel =
      front?.kind === "travel" && front.data.chasePursuit === true;
    if (isChaseTravel) {
      const t = front.data.targetTile as { x: number; y: number } | undefined;
      if (t && t.x === tx && t.y === ty) return; // already heading to the right tile
      // Rival moved → drop the stale path so TravelSystem re-paths to the new tile.
      delete chaser.farmer!.path;
      queue.shift();
    }
    queue.unshift({
      kind: "travel",
      data: { targetTile: { x: tx, y: ty }, chasePursuit: true },
      priority: -1, // highest urgency
    });
  }

  /** A fleeing target heads to its home region (away from the brawl) for the window. */
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
