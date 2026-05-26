import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_ENCOUNTER, type MeetBody } from "../protocols/encounter";

/**
 * MeetIndicatorSystem — snoops farmer inboxes each tick for `ONT_ENCOUNTER.MEET`
 * messages and tracks a short-lived visual indicator for each active MEET pair.
 *
 * Design choice (option a from the brief): read directly from the world's farmer
 * inboxes during `run()`. EncounterSystem pushes MEET directly into entity inboxes
 * (not via `bus.send`), so `bus.subscribeOntology` would never fire — inbox-polling
 * is the correct approach.
 *
 * Each indicator lives for `INDICATOR_DURATION_TICKS` ticks after the MEET fires.
 * Multiple simultaneous MEET pairs each produce their own indicator entry.
 */
export const INDICATOR_DURATION_TICKS = 10;

export interface MeetIndicatorEntry {
  farmerId: number;
  peerId: number;
  expiresAtTick: number;
}

export class MeetIndicatorSystem implements System {
  readonly name = "MeetIndicatorSystem";

  /** All currently live indicators, keyed by `farmerId:peerId`. */
  private readonly indicators = new Map<string, MeetIndicatorEntry>();

  constructor(private readonly world: World<GameEntity>) {}

  run(ctx: SimContext): void {
    // Scan all farmer inboxes for new MEET messages emitted this tick.
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

    // Purge expired indicators.
    for (const [key, entry] of this.indicators) {
      if (ctx.tick >= entry.expiresAtTick) {
        this.indicators.delete(key);
      }
    }
  }

  /**
   * Returns all currently active MEET indicators for the given tick.
   * Call from the render loop; returns a snapshot array (safe to iterate).
   */
  active(_tick: number): readonly MeetIndicatorEntry[] {
    return Array.from(this.indicators.values());
  }
}
