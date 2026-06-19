

import type { SimContext, System, World, MessageBus } from "@engine/core";
import type { GameEntity } from "../../components";
import { ONT_SIMULATION } from "../../protocols/simulation";
import { cropInventoryValue } from "../../economy";

export interface RunHistoryRow {
  day: number;
  farmerId: number;
  gold: number;
  rank: number;
}

export class RunHistorySystem implements System {
  readonly name = "RunHistorySystem";

  private readonly rows: RunHistoryRow[] = [];
  private lastDayProcessed = -1;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus?: MessageBus,
  ) {}

  run(_ctx: SimContext): void {
    let newDay: number | null = null;
    for (const station of this.world.query("weatherStation", "inbox")) {
      for (const msg of station.inbox.messages) {
        if (msg.ontology === ONT_SIMULATION.DAY_START) {
          this.bus?.markRead(ONT_SIMULATION.DAY_START);
          const day = (msg.body as { day: number }).day;
          if (day > this.lastDayProcessed) {
            newDay = day;
          }
        }
      }
      break; 
    }
    if (newDay === null) return;
    this.lastDayProcessed = newDay;

    const standings: Array<{ id: number; gold: number; totalValue: number }> = [];
    for (const f of this.world.query("farmer", "inventory")) {
      if (f.id === undefined) continue;
      const inv = f.inventory;
      const unsoldValue = cropInventoryValue(inv);
      standings.push({
        id: f.id,
        gold: inv.gold,
        totalValue: inv.gold + unsoldValue,
      });
    }

    standings.sort((a, b) => {
      const diff = b.totalValue - a.totalValue;
      if (diff !== 0) return diff;
      return a.id - b.id;
    });

    for (let i = 0; i < standings.length; i++) {
      const s = standings[i]!;
      this.rows.push({
        day: newDay,
        farmerId: s.id,
        gold: s.gold,
        rank: i + 1,
      });
    }
  }

  history(): readonly RunHistoryRow[] {
    return this.rows.slice();
  }
}
