import type { SimContext, System, MessageBus, World, Rng } from "@engine/core";
import type { GameEntity, CropKind } from "../../components";
import { ONT_SIMULATION, PERFORMATIVE } from "../../protocols";
import { ONT_BOUNTY, type Bounty, type BountyPostedBody } from "../../protocols/bounty";

// Posts a daily crop bounty on the notice board entity. Deterministic via rng.fork("bounty").
// Broadcasts ONT_BOUNTY.POSTED so perception folds it into beliefs.
const CROPS: readonly CropKind[] = ["radish", "wheat", "pumpkin"];

const BOUNTY_CHANCE = 0.6; // probability a given day has a bounty

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

    let bounty: Bounty | null = null;
    if (this.bountyRng.nextFloat() < BOUNTY_CHANCE) {
      const crop = this.bountyRng.pick(CROPS);
      const multiplier = Math.round((1.3 + this.bountyRng.range(0, 0.5)) * 10) / 10; // 1.3×–1.8× premium
      const quantity = this.bountyRng.int(5, 16);
      bounty = { crop, multiplier, quantity, day: newDay };
    }

    board.noticeBoard!.bountyText = bounty
      ? `Wanted: ${bounty.quantity} ${bounty.crop} @ ${bounty.multiplier}× price`
      : "No bounty today";

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
