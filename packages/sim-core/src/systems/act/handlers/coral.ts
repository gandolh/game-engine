/**
 * brief 48 — coral fishing action handlers: board-boat, fish-coral, return-to-shore.
 *
 * These are the three instant ACT-handler steps of a coral trip. Movement
 * between them is ordinary TravelSystem pathing (on the LAND grid to the dock,
 * then on the BOAT grid out to the reef once aboard). Like the shore-fishing
 * handlers, each step self-guards on the farmer's CURRENT tile / aboard state,
 * so the trip is re-derived by deliberation each arrival rather than scripted:
 *
 *   board-boat       — only when standing on a dock tile and on foot → aboard=true.
 *   fish-coral        — only when aboard AND standing on a coral reef tile →
 *                       lands a special fish (coral-trout|lobster), banks gold,
 *                       grants fishing XP, sets a busy window. Broadcasts a feed
 *                       line for the rare lobster.
 *   return-to-shore  — only when aboard AND back on a dock tile → aboard=false.
 *
 * Coral fishing REUSES the shore-fishing catch resolution (pickWeightedFish +
 * the rarity-bonus reallocation), just with the coral-only weight table. The
 * pick runs on the same forked fish rng so it stays deterministic.
 */
import type { Rng, MessageBus } from "@engine/core";
import { FISH_VALUE, CORAL_WEIGHTS, FISH_MIN_TICKS, FISH_MAX_TICKS, zeroFish } from "../../../components";
import { grantSkillXp, fishingRarityBonus } from "../../skills";
import { isCoralReefTile, isDockTile, nearestReef } from "../../../world/coral";
import { applyCoralRarityBonus } from "../helpers";
import { pickWeightedFish } from "./fishing";
import { ONT_CORAL, type CoralCaughtBody } from "../../../protocols/coral";
import { PERFORMATIVE } from "../../../protocols/performatives";
import type { ActingFarmer } from "../types";

/** Board the moored boat — only valid standing on a dock tile, on foot. */
export function handleBoardBoat(farmer: ActingFarmer): void {
  if (!farmer.farmer || !farmer.transform) return;
  if (farmer.farmer.aboard) return; // already aboard
  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  if (!isDockTile(fx, fy)) return; // can only board at a dock
  farmer.farmer.aboard = true;
}

/** Disembark back onto land — only valid when aboard AND on a dock tile. */
export function handleReturnToShore(farmer: ActingFarmer): void {
  if (!farmer.farmer || !farmer.transform) return;
  if (!farmer.farmer.aboard) return;
  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  if (!isDockTile(fx, fy)) return; // must be back at a dock to step off
  farmer.farmer.aboard = false;
}

/**
 * Fish a coral reef. Requirements: a fishing rod, aboard, and standing ON a
 * coral reef tile. Lands one special species (weighted, skill-boosted toward
 * the rare lobster), banks its (premium) gold, tallies it, grants fishing XP,
 * and sets a busy window. Broadcasts a feed line ONLY for the jackpot lobster.
 */
export function handleFishCoral(
  farmer: ActingFarmer,
  tick: number,
  fishRng: Rng | null,
  bus?: MessageBus,
): void {
  if (!farmer.farmer || !farmer.transform) return;
  if (!farmer.farmer.aboard) return;
  const rod = (farmer.inventory.tools ?? []).find((t) => t.kind === "fishing-rod");
  if (!rod) return;
  const fx = Math.round(farmer.transform.x);
  const fy = Math.round(farmer.transform.y);
  if (!isCoralReefTile(fx, fy)) return; // must be on the reef

  // Coral-only weights, reallocated toward the rare lobster by fishing skill.
  const weights = applyCoralRarityBonus(
    CORAL_WEIGHTS,
    fishingRarityBonus(farmer.skills?.fishing ?? 0),
  );
  const fish = pickWeightedFish(weights, fishRng);
  const busyTicks = fishRng
    ? fishRng.int(FISH_MIN_TICKS, FISH_MAX_TICKS + 1)
    : FISH_MIN_TICKS;

  if (!farmer.inventory.fish) farmer.inventory.fish = zeroFish();
  farmer.inventory.fish[fish] += 1;
  farmer.inventory.gold += FISH_VALUE[fish];
  grantSkillXp(farmer, "fishing", 2); // coral casts are worth more XP than shore

  farmer.farmer.busyUntilTick = tick + busyTicks;

  // Narrate only the jackpot lobster (routine coral-trout would flood the feed).
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
