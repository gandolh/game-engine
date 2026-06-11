import type { Rng, MessageBus } from "@engine/core";
import { FISH_VALUE, CORAL_WEIGHTS, FISH_MIN_TICKS, FISH_MAX_TICKS, zeroFish } from "../../../components";
import { grantSkillXp, fishingRarityBonus } from "../../skills";
import { isCoralReefTile, isDockTile, nearestReef } from "../../../world/coral";
import { applyCoralRarityBonus } from "../helpers";
import { pickWeightedFish } from "./fishing";
import { ONT_CORAL, type CoralCaughtBody } from "../../../protocols/coral";
import { PERFORMATIVE } from "../../../protocols/performatives";
import type { ActingFarmer } from "../types";

export function handleBoardBoat(farmer: ActingFarmer): void {
  if (!farmer.farmer || !farmer.transform) return;
  if (farmer.farmer.aboard) return;
  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  if (!isDockTile(fx, fy)) return;
  farmer.farmer.aboard = true;
}

export function handleReturnToShore(farmer: ActingFarmer): void {
  if (!farmer.farmer || !farmer.transform) return;
  if (!farmer.farmer.aboard) return;
  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  if (!isDockTile(fx, fy)) return;
  farmer.farmer.aboard = false;
}

/** Requires fishing rod + aboard + on coral reef tile. Feed broadcast only for jackpot lobster. */
export function handleFishCoral(
  farmer: ActingFarmer,
  tick: number,
  fishRng: Rng,
  bus?: MessageBus,
): void {
  if (!farmer.farmer || !farmer.transform) return;
  if (!farmer.farmer.aboard) return;
  const rod = (farmer.inventory.tools ?? []).find((t) => t.kind === "fishing-rod");
  if (!rod) return;
  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  if (!isCoralReefTile(fx, fy)) return;

  const weights = applyCoralRarityBonus(
    CORAL_WEIGHTS,
    fishingRarityBonus(farmer.skills?.fishing ?? 0),
  );
  const fish = pickWeightedFish(weights, fishRng);
  const busyTicks = fishRng.int(FISH_MIN_TICKS, FISH_MAX_TICKS + 1);

  if (!farmer.inventory.fish) farmer.inventory.fish = zeroFish();
  farmer.inventory.fish[fish] += 1;
  farmer.inventory.gold += FISH_VALUE[fish];
  grantSkillXp(farmer, "fishing", 2); // 2 XP vs 1 for shore casts

  farmer.farmer.busyUntilTick = tick + busyTicks;

  if (fish === "lobster" && bus && farmer.id !== undefined) {
    const reef = nearestReef(fx, fy);
    const body: CoralCaughtBody = {
      farmerId: farmer.id,
      farmerName: farmer.farmer.name,
      fish,
      reefId: reef.id,
      value: FISH_VALUE[fish],
    };
    bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: ONT_CORAL.CAUGHT,
        sender: farmer.id,
        recipient: "broadcast",
        body: body as unknown as Record<string, unknown>,
      },
      tick,
    );
  }
}
