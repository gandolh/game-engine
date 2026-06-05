import type { SimContext, System, MessageBus, World, AgentMessage } from "@engine/core";
import type { GameEntity, DecorationKind, PendingCommission } from "../components";
import { DECORATION_RECIPE, MAX_DECORATION_BOOST } from "../components";
import { REGIONS } from "../world/regions";
import { findById } from "./entity-helpers";
import { PERFORMATIVE } from "../protocols/performatives";
import {
  ONT_COMMISSION,
  type CommissionBuildBody,
  type CommissionDoneBody,
} from "../protocols/commission";

/**
 * brief 44 — CarpenterSystem: the carpenter NPC now fulfills REAL commissions.
 *
 * This is the order→fulfill half of the loop, modelled on
 * `ShopkeeperSystem.handleSell`: an agent sends a `commission-build` order (its
 * `commission-build` act emits ONT_COMMISSION.BUILD to the carpenter), and this
 * SYSTEM — not agent logic — validates it, charges the wood cost up-front
 * (escrow), queues the job for a short build-time, and on completion DELIVERS
 * the structure (spawns the decoration on the farmer's farm) + replies
 * ONT_COMMISSION.DONE.
 *
 * Why a build-time (not instant like the old `craft-decoration`): the brief asks
 * the carpenter to actually *work* an order over time so the village reads as
 * alive (the NPC is busy on a real job, not just pantomiming). The cost is paid
 * when the order is accepted so a farmer can't double-spend the same wood while
 * a job is in flight.
 *
 * Determinism: message-driven + a per-job tick countdown. No Math.random /
 * Date.now. Pending commissions are processed in array order; delivery tile is
 * the first free farm tile in a fixed (row-major) scan, exactly like the old
 * craft-decoration placement — so a replay is byte-identical.
 */

/** Ticks the carpenter spends building a commission before delivery (~1.5s @20Hz). */
export const COMMISSION_BUILD_TICKS = 30;

export class CarpenterSystem implements System {
  readonly name = "CarpenterSystem";

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
  ) {}

  run(ctx: SimContext): void {
    const carpenter = this.findCarpenter();
    if (!carpenter || !carpenter.inbox || !carpenter.carpenter) return;

    // 1. Accept new BUILD orders from the inbox (escrow cost up-front).
    const remaining: AgentMessage[] = [];
    for (const msg of carpenter.inbox.messages) {
      if (msg.ontology === ONT_COMMISSION.BUILD) {
        this.acceptOrder(msg, ctx, carpenter);
      } else {
        remaining.push(msg);
      }
    }
    carpenter.inbox.messages = remaining;

    // 2. Tick down in-flight commissions; deliver the finished ones.
    const pending = carpenter.carpenter.pending;
    if (pending && pending.length > 0) {
      const stillBuilding: PendingCommission[] = [];
      for (const job of pending) {
        job.ticksLeft -= 1;
        if (job.ticksLeft > 0) {
          stillBuilding.push(job);
          continue;
        }
        this.deliver(job, ctx);
      }
      carpenter.carpenter.pending = stillBuilding;
    }
  }

  // ---- accept ------------------------------------------------------------

  private acceptOrder(msg: AgentMessage, ctx: SimContext, carpenter: GameEntity): void {
    if (msg.sender === "world" || typeof msg.sender !== "number") return;
    const farmer = findById(this.world, msg.sender, "farmer", "inventory");
    if (!farmer || !farmer.inventory || !farmer.farmer?.homeRegion) return;

    const body = msg.body as Partial<CommissionBuildBody>;
    const kind = body.kind as DecorationKind | undefined;
    const recipe = kind ? DECORATION_RECIPE[kind] : undefined;
    if (!kind || !recipe) {
      this.replyDone(ctx.tick, msg.sender, { ok: false, kind: (kind ?? "scarecrow"), reason: "invalid-commission" });
      return;
    }

    // Validate materials: the carpenter requires the recipe's wood up-front.
    const res = farmer.resources;
    if (!res || res.wood < recipe.woodCost) {
      this.replyDone(ctx.tick, msg.sender, { ok: false, kind, reason: "insufficient-wood" });
      return;
    }

    // Validate boost cap (don't accept a commission that would be wasted).
    let existingBoost = 0;
    for (const e of this.world.query("farmDecoration")) {
      if (e.farmDecoration.ownerId === farmer.id) {
        existingBoost += DECORATION_RECIPE[e.farmDecoration.kind]?.yieldBoost ?? 0;
      }
    }
    if (existingBoost >= MAX_DECORATION_BOOST) {
      this.replyDone(ctx.tick, msg.sender, { ok: false, kind, reason: "boost-maxed" });
      return;
    }

    // Escrow: charge the wood now, queue the build. The decoration is spawned on
    // delivery (after the build-time) so the farmer pays before the work begins.
    res.wood -= recipe.woodCost;
    if (!carpenter.carpenter!.pending) carpenter.carpenter!.pending = [];
    carpenter.carpenter!.pending.push({
      ownerId: farmer.id!,
      regionId: farmer.farmer.homeRegion,
      kind,
      ticksLeft: COMMISSION_BUILD_TICKS,
    });
  }

  // ---- deliver -----------------------------------------------------------

  private deliver(job: PendingCommission, ctx: SimContext): void {
    const regionDef = REGIONS.find((r) => r.id === job.regionId);
    if (!regionDef) {
      this.replyDone(ctx.tick, job.ownerId, { ok: false, kind: job.kind, reason: "no-region" });
      return;
    }

    // Collect occupied tiles on the farm (same scan as the old craft-decoration).
    const usedTiles = new Set<string>();
    for (const e of this.world.query("plot")) {
      if (e.plot.regionId === job.regionId) usedTiles.add(`${e.plot.tileX},${e.plot.tileY}`);
    }
    for (const e of this.world.query("farmDecoration")) {
      if (e.farmDecoration.regionId === job.regionId) usedTiles.add(`${e.farmDecoration.tileX},${e.farmDecoration.tileY}`);
    }
    for (const e of this.world.query("tileFeature")) {
      if (e.tileFeature.regionId === job.regionId) usedTiles.add(`${e.tileFeature.tileX},${e.tileFeature.tileY}`);
    }
    for (const e of this.world.query("fountain")) {
      if (e.fountain.regionId === job.regionId && e.transform) {
        usedTiles.add(`${Math.round(e.transform.x)},${Math.round(e.transform.y)}`);
      }
    }
    for (const e of this.world.query("pen")) {
      if (e.pen.regionId === job.regionId) usedTiles.add(`${e.pen.tileX},${e.pen.tileY}`);
    }

    const b = regionDef.bounds;
    let placed = false;
    outer: for (let ty = b.minY; ty <= b.maxY; ty++) {
      for (let tx = b.minX; tx <= b.maxX; tx++) {
        if (usedTiles.has(`${tx},${ty}`)) continue;
        this.world.spawn({
          transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
          sprite: { atlasId: "main", frame: `decoration/${job.kind}`, layer: 20, tintRgba: 0xffffffff },
          farmDecoration: { kind: job.kind, tileX: tx, tileY: ty, regionId: job.regionId, ownerId: job.ownerId },
        });
        placed = true;
        break outer;
      }
    }

    this.replyDone(ctx.tick, job.ownerId, {
      ok: placed,
      kind: job.kind,
      ...(placed ? {} : { reason: "no-free-tile" }),
    });
  }

  // ---- helpers -----------------------------------------------------------

  private replyDone(tick: number, to: number, body: CommissionDoneBody): void {
    this.bus.send(
      {
        performative: body.ok ? PERFORMATIVE.INFORM : PERFORMATIVE.FAILURE,
        ontology: ONT_COMMISSION.DONE,
        sender: "world",
        recipient: to,
        body: body as unknown as Record<string, unknown>,
      },
      tick,
    );
  }

  private findCarpenter(): GameEntity | undefined {
    for (const c of this.world.query("carpenter", "inbox")) return c;
    return undefined;
  }
}
