import type { SimContext, System, MessageBus, World, Rng } from "@engine/core";
import type { GameEntity, CropKind } from "../components";
import { ONT_SIMULATION, PERFORMATIVE } from "../protocols";
import { ONT_BOUNTY, type Bounty, type BountyPostedBody } from "../protocols/bounty";

/**
 * NoticeBoardSystem — posts a daily crop bounty on the town-square notice board.
 *
 * Each day-start it picks one crop the village wants at a price premium, stamps
 * `bountyText` on the notice-board entity (for the hover tooltip + future UI),
 * and broadcasts ONT_BOUNTY.POSTED so farmer perception can surface it into
 * beliefs. Some days there is no bounty (adds variety; agents fall back to the
 * normal shop price).
 *
 * Detection mirrors ShopSlateSystem: scan the notice-board entity's inbox for a
 * new DAY_START and react once per day. Deterministic via a dedicated rng fork.
 */
const CROPS: readonly CropKind[] = ["radish", "wheat", "pumpkin"];

/** Probability a given day has a bounty at all. */
const BOUNTY_CHANCE = 0.6;

export class NoticeBoardSystem implements System {
  readonly name = "NoticeBoardSystem";

  private lastDayProcessed = -1;
  private readonly bountyRng: Rng;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
    rng: Rng,
  ) {
    this.bountyRng = rng.fork("bounty");
  }

  run(ctx: SimContext): void {
    const board = this.findBoard();
    if (!board || !board.inbox) return;

    let newDay: number | null = null;
    for (const msg of board.inbox.messages) {
      if (msg.ontology === ONT_SIMULATION.DAY_START) {
        const day = (msg.body as { day: number }).day;
        if (day > this.lastDayProcessed) newDay = day;
      }
    }
    if (newDay === null) return;
    this.lastDayProcessed = newDay;

    // Decide whether there's a bounty today, and for which crop.
    let bounty: Bounty | null = null;
    if (this.bountyRng.nextFloat() < BOUNTY_CHANCE) {
      const crop = this.bountyRng.pick(CROPS);
      // 1.3×–1.8× premium, rounded to one decimal.
      const multiplier = Math.round((1.3 + this.bountyRng.range(0, 0.5)) * 10) / 10;
      const quantity = this.bountyRng.int(5, 16);
      bounty = { crop, multiplier, quantity, day: newDay };
    }

    // Stamp display text on the board entity for the hover tooltip / UI.
    board.noticeBoard!.bountyText = bounty
      ? `Wanted: ${bounty.quantity} ${bounty.crop} @ ${bounty.multiplier}× price`
      : "No bounty today";

    // Broadcast so farmer perception can fold it into beliefs.
    const body: BountyPostedBody = { bounty };
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: ONT_BOUNTY.POSTED,
        sender: "world",
        recipient: "broadcast",
        body: body as unknown as Record<string, unknown>,
      },
      ctx.tick,
    );
  }

  private findBoard(): GameEntity | undefined {
    for (const e of this.world.query("noticeBoard", "inbox")) return e;
    return undefined;
  }
}
