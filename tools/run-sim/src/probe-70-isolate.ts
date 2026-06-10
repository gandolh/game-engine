/**
 * probe-70-isolate.ts — isolated test: does Hannah's initiateCrop actually fire?
 * Creates Hannah + Atticus in a minimal world and runs encounter + trade.
 */
import { World, MessageBus } from "@engine/core";
import type { GameEntity, CropKind } from "@farm/sim-core/components";
import { EncounterSystem } from "@farm/sim-core/systems/encounter";
import { EncounterTradeSystem } from "@farm/sim-core/systems/encounter-trade/index";
import { ONT_ENCOUNTER } from "@farm/sim-core/protocols/encounter";
import { ZERO_CROPS } from "@farm/sim-core/economy";

// Side-effect imports — registering all peer-trade hooks.
import "@farm/sim-core/agents/hoarder";
import "@farm/sim-core/agents/aggressive";
import "@farm/sim-core/agents/conservative";
import "@farm/sim-core/agents/opportunist";

const ZERO: Record<CropKind, number> = { ...ZERO_CROPS };

function spawnFarmer(
  world: World<GameEntity>,
  spec: {
    personality: "hoarder" | "aggressive" | "conservative" | "opportunist";
    gold?: number;
    reserve?: number;
    crops?: Partial<Record<CropKind, number>>;
  },
): GameEntity {
  const defaultReserve: Record<string, number> = {
    hoarder: 80,
    aggressive: 10,
    conservative: 30,
    opportunist: 50,
  };
  return world.spawn({
    farmer: { name: spec.personality, currentRegion: "village" },
    personality: { kind: spec.personality },
    inbox: { messages: [] },
    beliefs: { data: { currentDay: 8 }, revision: 0 },
    desires: {
      data: {
        minGoldReserve: spec.reserve ?? defaultReserve[spec.personality],
      },
    },
    intentions: { queue: [] },
    inventory: {
      gold: spec.gold ?? 200,
      crops: { ...ZERO, ...spec.crops },
      seeds: { ...ZERO },
    },
  });
}

function main(): void {
  const world = new World<GameEntity>();
  const bus = new MessageBus();
  const encounter = new EncounterSystem(world, bus);
  const trade = new EncounterTradeSystem(world);

  // Hannah (hoarder) with wheat=9 (same as d18 on seed 0xc0ffee)
  const hannah = spawnFarmer(world, {
    personality: "hoarder",
    gold: 89,
    reserve: 80,
    crops: { wheat: 9 },
  });
  // Atticus-9 (aggressive) with moderate gold
  const atticus = spawnFarmer(world, {
    personality: "aggressive",
    gold: 200,
    reserve: 10,
  });

  console.log(`Hannah id=${hannah.id}, Atticus id=${atticus.id}`);
  console.log(`Hannah wheat=${hannah.inventory!.crops.wheat}, gold=${hannah.inventory!.gold}`);
  console.log(`Atticus gold=${atticus.inventory!.gold}`);

  // Run EncounterSystem (generates MEET)
  encounter.run({ tick: 360 }); // tick at d18 with ticksPerDay=20

  console.log("\nAfter EncounterSystem:");
  console.log(`  Hannah inbox: ${JSON.stringify(hannah.inbox!.messages.map((m) => m.ontology))}`);
  console.log(`  Atticus inbox: ${JSON.stringify(atticus.inbox!.messages.map((m) => m.ontology))}`);

  // Run EncounterTradeSystem (processes MEET, fires OFFER_CROP)
  trade.run({ tick: 360 });

  console.log("\nAfter EncounterTradeSystem:");
  console.log(`  Hannah inbox: ${JSON.stringify(hannah.inbox!.messages.map((m) => m.ontology))}`);
  console.log(`  Atticus inbox: ${JSON.stringify(atticus.inbox!.messages.map((m) => m.ontology))}`);
  console.log(`  Hannah wheat=${hannah.inventory!.crops.wheat}, gold=${hannah.inventory!.gold}`);
  console.log(`  Atticus gold=${atticus.inventory!.gold}, wheat=${atticus.inventory!.crops.wheat}`);

  const offerCrops = atticus.inbox!.messages.filter(
    (m) => m.ontology === ONT_ENCOUNTER.OFFER_CROP,
  );
  const accepts = hannah.inbox!.messages.filter(
    (m) => m.ontology === ONT_ENCOUNTER.ACCEPT,
  );
  const declines = hannah.inbox!.messages.filter(
    (m) => m.ontology === ONT_ENCOUNTER.DECLINE,
  );

  console.log(`\nOFFER_CROP in Atticus's inbox: ${offerCrops.length}`);
  console.log(`ACCEPT in Hannah's inbox: ${accepts.length}`);
  console.log(`DECLINE in Hannah's inbox: ${declines.length}`);
  if (declines.length > 0) {
    console.log(`  Decline reasons: ${declines.map((d) => (d.body as { reason?: string }).reason).join(", ")}`);
  }
}

main();
