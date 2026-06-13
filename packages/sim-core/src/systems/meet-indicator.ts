import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_ENCOUNTER, type MeetBody } from "../protocols/encounter";

export const INDICATOR_DURATION_TICKS = 10;

export interface MeetIndicatorEntry {
  farmerId: number;
  peerId: number;
  expiresAtTick: number;
}

export class MeetIndicatorSystem implements System {
  readonly name = "MeetIndicatorSystem";

  private readonly indicators = new Map<string, MeetIndicatorEntry>(); 

  constructor(private readonly world: World<GameEntity>) {}

  run(ctx: SimContext): void {
    for (const entity of this.world.query("farmer", "inbox")) {
      if (entity.id === undefined) continue;
      for (const msg of entity.inbox.messages) {
        if (msg.ontology !== ONT_ENCOUNTER.MEET) continue;
        if (msg.tickIssued !== ctx.tick) continue;
        const body = msg.body as unknown as MeetBody;
        const key = `${entity.id}:${body.peerId}`;
        this.indicators.set(key, {
          farmerId: entity.id,
          peerId: body.peerId,
          expiresAtTick: ctx.tick + INDICATOR_DURATION_TICKS,
        });
      }
    }

    for (const [key, entry] of this.indicators) {
      if (ctx.tick >= entry.expiresAtTick) {
        this.indicators.delete(key);
      }
    }
  }

  active(_tick: number): readonly MeetIndicatorEntry[] {
    return Array.from(this.indicators.values());
  }
}
