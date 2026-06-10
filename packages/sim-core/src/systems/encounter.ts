import type { SimContext, System, MessageBus, World, AgentMessage } from "@engine/core";
import type { GameEntity } from "../components";
import { REGIONS, type RegionId } from "../world/regions";
import { ONT_ENCOUNTER, type MeetBody } from "../protocols/encounter";
import { PERFORMATIVE } from "../protocols/performatives";

/**
 * EncounterSystem — detects co-located farmer pairs and emits MEET into each
 * farmer's inbox. Personalities can then react with OFFER_SEED / ACCEPT /
 * DECLINE messages handled elsewhere.
 *
 * Determinism notes:
 *   - Region groups are iterated in `REGIONS` order.
 *   - Within a region, farmers are sorted by id ascending; pairs always carry
 *     the lower id first in the key.
 *   - `lastMet` is keyed by `min(a,b):max(a,b)` → tick of the most recent MEET.
 *     A pair re-emits only after `MEET_COOLDOWN_TICKS` have elapsed.
 *
 * The MessageBus is taken to keep the system signature consistent with other
 * systems and to leave a hook for future broadcast events; the current
 * implementation pushes MEET directly into each peer's inbox so the message
 * is observable on the very next inbox-processing tick.
 */
export const MEET_COOLDOWN_TICKS = 20;

export class EncounterSystem implements System {
  readonly name = "EncounterSystem";

  private readonly lastMet = new Map<string, number>();

  // The bus is currently unused but accepted so the signature matches other
  // systems and leaves a hook for future encounter-broadcast events.
  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus: MessageBus,
  ) {
    void this.bus;
  }

  run(ctx: SimContext): void {
    // Gather farmers in id-ascending order for deterministic pairing.
    const farmers: GameEntity[] = [];
    for (const e of this.world.query("farmer", "inbox")) {
      if (e.id === undefined) continue;
      farmers.push(e);
    }
    if (farmers.length < 2) return;
    farmers.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    // Group by region.
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

    // Iterate region groups in REGIONS order for determinism.
    for (const regionDef of REGIONS) {
      const group = byRegion.get(regionDef.id);
      if (!group || group.length < 2) continue;
      // group is already id-ascending because `farmers` was sorted.
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
