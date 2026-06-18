import { Scheduler } from "@engine/core";
import { DayClockSystem } from "./systems/day-clock";
import { generateTerrain, type TerrainGrid } from "./world/terrain";

export interface CitadelSimOptions {
  seed: number;
  ticksPerDay: number;
  maxDays: number;
}

export interface CitadelSimResult {
  scheduler: Scheduler;
  dayClock: DayClockSystem;
  terrain: TerrainGrid;
}

/**
 * Bootstrap the Citadel sim.
 * Worker-agnostic: safe to call on the main thread (headless) or inside a
 * Web Worker. No Worker-specific APIs are referenced here.
 */
export function bootstrapSim(opts: CitadelSimOptions): CitadelSimResult {
  const { seed, ticksPerDay } = opts;

  // Generate deterministic terrain
  const terrain = generateTerrain(seed);

  // Build scheduler
  const scheduler = new Scheduler();
  const dayClock = new DayClockSystem(ticksPerDay);

  scheduler.stage("clock").add(dayClock);

  return { scheduler, dayClock, terrain };
}
