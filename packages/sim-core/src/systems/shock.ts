import type { SimContext, System, MessageBus, World, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { PERFORMATIVE, ONT_SIMULATION, type ShockBody, type ShockKind } from "../protocols";

export interface ShockConfig {
  /** Day the shock fires on. Defaults to the run midpoint (floor(maxDays / 2)). */
  shockDay: number;
  /** Which shock to apply. Only "blight" exists today. */
  kind: ShockKind;
}

/** One-time mid-game blight: wipes all planted plots of a deterministically chosen farmer.
 *  Target chosen via rng.fork("shock"); same seed → same target, same day, every replay.
 */
export class ShockSystem implements System {
  readonly name = "ShockSystem";

  private readonly shockRng: Rng;
  private readonly shockDay: number;
  private readonly kind: ShockKind;
  private lastBoundary = -1;
  private fired = false;

  constructor(
    private readonly bus: MessageBus,
    private readonly world: World<GameEntity>,
    rng: Rng,
    private readonly ticksPerDay: number,
    config: ShockConfig,
  ) {
    this.shockRng = rng.fork("shock");
    this.shockDay = config.shockDay;
    this.kind = config.kind;
  }

  run(ctx: SimContext): void {
    if (this.fired) return;
    const boundary = Math.floor(ctx.tick / this.ticksPerDay);
    if (boundary === this.lastBoundary) return;
    this.lastBoundary = boundary;
    if (boundary !== this.shockDay) return;

    this.fired = true;
    this.applyBlight(ctx);
  }

  private applyBlight(ctx: SimContext): void {
    const farmers: GameEntity[] = [];
    for (const f of this.world.query("farmer")) {
      if (f.id !== undefined) farmers.push(f);
    }
    if (farmers.length === 0) return;

    // Prefer farmers with planted crops (a whiff shock isn't a "moment").
    const plantedByOwner = new Map<number, number>();
    for (const plot of this.world.query("plot")) {
      if (plot.plot.state.kind === "planted") {
        plantedByOwner.set(plot.plot.ownerId, (plantedByOwner.get(plot.plot.ownerId) ?? 0) + 1);
      }
    }

    farmers.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const withCrops = farmers.filter((f) => (plantedByOwner.get(f.id!) ?? 0) > 0);
    const pool = withCrops.length > 0 ? withCrops : farmers;
    const target = this.shockRng.pick(pool);
    const targetId = target.id!;

    let plotsWiped = 0;
    for (const plot of this.world.query("plot")) {
      if (plot.plot.ownerId !== targetId) continue;
      if (plot.plot.state.kind === "planted") {
        plot.plot.state = { kind: "empty" };
        plotsWiped += 1;
      }
    }

    const body: ShockBody = {
      kind: this.kind,
      day: this.shockDay,
      targetFarmerId: targetId,
      targetName: target.farmer?.name ?? `#${targetId}`,
      plotsWiped,
    };
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: ONT_SIMULATION.SHOCK,
        sender: "world",
        recipient: "broadcast",
        body: body as unknown as Record<string, unknown>,
      },
      ctx.tick,
    );
  }
}

/** Default shock day = run midpoint. */
export function defaultShockDay(maxDays: number): number {
  return Math.floor(maxDays / 2);
}
