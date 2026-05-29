import type { SimContext, System, MessageBus, World, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { PERFORMATIVE, ONT_SIMULATION, type ShockBody, type ShockKind } from "../protocols";

export interface ShockConfig {
  /** Day the shock fires on. Defaults to the run midpoint (floor(maxDays / 2)). */
  shockDay: number;
  /** Which shock to apply. Only "blight" exists today. */
  kind: ShockKind;
}

/**
 * ShockSystem — a deterministic, one-time mid-game "moment" (Direction B of
 * brief 23). On the configured shock day it wipes every planted plot of a
 * single deterministically-chosen farmer (a blight), then broadcasts
 * `ONT_SIMULATION.SHOCK` so observers/feeds can narrate it. Fires exactly once.
 *
 * This is a variance injector, not a balance lever — it exists to reshuffle
 * standings and create a story beat, consistent with the "moments matter, no
 * balance work" stance in corpus/wiki/open-questions.md.
 *
 * Determinism: the target farmer is chosen via a dedicated `rng.fork("shock")`
 * exactly once, so a given seed always strikes the same farmer on the same day.
 * Day detection mirrors DayClockSystem (boundary from tick / ticksPerDay), so
 * the system is self-contained and needs no inbox.
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
    // Fork off the shared rng so consuming shock randomness never perturbs the
    // weather/auction streams (named-fork determinism).
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

    // Count planted plots per farmer so the blight reliably *lands* — a shock
    // that wipes nothing isn't a "moment". Prefer farmers with crops to lose.
    const plantedByOwner = new Map<number, number>();
    for (const plot of this.world.query("plot")) {
      if (plot.plot.state.kind === "planted") {
        plantedByOwner.set(plot.plot.ownerId, (plantedByOwner.get(plot.plot.ownerId) ?? 0) + 1);
      }
    }

    // Deterministic target. Sort by id first so iteration order can't affect
    // the pick (query order is not contractually stable).
    farmers.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const withCrops = farmers.filter((f) => (plantedByOwner.get(f.id!) ?? 0) > 0);
    // Pick among farmers who actually have planted crops; only if none do,
    // fall back to any farmer (the blight then harmlessly whiffs).
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
