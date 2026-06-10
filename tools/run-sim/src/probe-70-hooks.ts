/**
 * probe-70-hooks.ts — verify that getPeerTradeHooks("hoarder").initiateCrop
 * fires correctly and that the registry is populated.
 */
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import { getPeerTradeHooks } from "@farm/sim-core/agents/peer-trade-registry";
import { makePathfinder } from "./pathfinder";
import { ZERO_CROPS } from "@farm/sim-core/economy";
import type { CropKind } from "@farm/sim-core/components";
import type { RegionId } from "@farm/sim-core/world/regions";

const ZERO: Record<CropKind, number> = { ...ZERO_CROPS };

async function main(): Promise<void> {
  // 1. Check if hoarder hooks are registered BEFORE bootstrapSim
  const hooksBefore = getPeerTradeHooks("hoarder");
  console.log(`Hoarder hooks registered BEFORE bootstrapSim: ${hooksBefore !== undefined}`);
  if (hooksBefore) {
    console.log(`  initiateCrop: ${hooksBefore.initiateCrop !== undefined}`);
  }

  // 2. Bootstrap sim (which also imports agents as side effects)
  const pathfinder = await makePathfinder();
  const { world } = bootstrapSim({ seed: 0xc0ffee, ticksPerDay: 20, maxDays: 1, pathfinder });

  // 3. Check hooks after bootstrap
  const hooksAfter = getPeerTradeHooks("hoarder");
  console.log(`\nHoarder hooks AFTER bootstrapSim: ${hooksAfter !== undefined}`);
  if (hooksAfter) {
    console.log(`  initiateCrop: ${hooksAfter.initiateCrop !== undefined}`);
    console.log(`  respond: ${hooksAfter.respond !== undefined}`);
    console.log(`  initiate: ${hooksAfter.initiate !== undefined}`);
  }

  // 4. Find Hannah and call initiateCrop directly
  for (const f of world.query("farmer", "inventory")) {
    if (f.farmer?.name !== "Hannah") continue;
    console.log(`\nHannah entity: id=${f.id}, personality=${f.personality?.kind}`);
    console.log(`  wheat=${f.inventory!.crops["wheat"]} gold=${f.inventory!.gold}`);

    // Manually set wheat to 9 (simulate mid-game state)
    f.inventory!.crops["wheat"] = 9;

    const hooks = getPeerTradeHooks("hoarder");
    if (!hooks?.initiateCrop) {
      console.log("  ERROR: no initiateCrop hook found!");
      break;
    }

    const result = hooks.initiateCrop(
      f,
      { peerId: 15, regionId: "market" as never },
      { tick: 360 },
    );
    console.log(`  initiateCrop result: ${JSON.stringify(result)}`);
    break;
  }

  // 5. Test directly with a mock farmer having correct crops
  console.log("\n=== MOCK FARMER TEST ===");
  const mockFarmer = world.spawn({
    farmer: { name: "TestHoarder", currentRegion: "market" as RegionId },
    personality: { kind: "hoarder" },
    inbox: { messages: [] },
    beliefs: { data: { currentDay: 18 }, revision: 0 },
    desires: { data: { minGoldReserve: 80 } },
    intentions: { queue: [] },
    inventory: {
      gold: 89,
      crops: { ...ZERO, wheat: 9 },
      seeds: { ...ZERO },
    },
  });

  const hooks = getPeerTradeHooks("hoarder");
  if (!hooks?.initiateCrop) {
    console.log("ERROR: no initiateCrop for mock");
  } else {
    const result = hooks.initiateCrop(
      mockFarmer,
      { peerId: 999, regionId: "market" as never },
      { tick: 360 },
    );
    console.log(`Mock hoarder initiateCrop result: ${JSON.stringify(result)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
