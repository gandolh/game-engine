import type { SimContext, System, MessageBus, World, AgentMessage } from "@engine/core";
import type { GameEntity } from "../../components";
import { REGIONS, type RegionId } from "../../world/regions";
import { ONT_ENCOUNTER, type MeetBody } from "../../protocols/encounter";
import { PERFORMATIVE } from "../../protocols/performatives";

export const MEET_COOLDOWN_TICKS = 20;

export class EncounterSystem implements System {
  readonly name = "EncounterSystem";

  private readonly lastMet = new Map<string, number>();

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
  ) {
    void this.bus;
  }

  run(ctx: SimContext): void {
    const farmers: GameEntity[] = [];
    for (const e of this.world.query("farmer", "inbox")) {
      if (e.id === undefined) continue;
      farmers.push(e);
    }
    if (farmers.length < 2) return;
    farmers.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    const byRegion = new Map<RegionId, GameEntity[]>();
    for (const f of farmers) {
      const region = f.farmer?.currentRegion;
      if (!region) continue;
      let list = byRegion.get(region);
      if (!list) {
        list = [];
        byRegion.set(region, list);
      }
      list.push(f);
    }

    for (const regionDef of REGIONS) {
      const group = byRegion.get(regionDef.id);
      if (!group || group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i]!;
          const b = group[j]!;
          const aid = a.id!;
          const bid = b.id!;
          const lo = aid < bid ? aid : bid;
          const hi = aid < bid ? bid : aid;
          const key = `${lo}:${hi}`;
          const last = this.lastMet.get(key);
          if (last !== undefined && ctx.tick - last <= MEET_COOLDOWN_TICKS) continue;

          this.emitMeet(a, bid, regionDef.id, ctx.tick);
          this.emitMeet(b, aid, regionDef.id, ctx.tick);
          this.lastMet.set(key, ctx.tick);
        }
      }
    }
  }

  private emitMeet(recipient: GameEntity, peerId: number, regionId: RegionId, tick: number): void {
    if (!recipient.inbox) return;
    const body: MeetBody = { peerId, regionId };
    const msg: AgentMessage = {
      performative: PERFORMATIVE.INFORM,
      ontology: ONT_ENCOUNTER.MEET,
      sender: "world",
      body: body as unknown as Record<string, unknown>,
      tickIssued: tick,
    };
    recipient.inbox.messages.push(msg);
  }
}
