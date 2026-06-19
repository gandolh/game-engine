import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import type { ObserverSnapshot } from "../snapshot/observer-types";
import { seasonForDay } from "../protocols";
import { skillLevel } from "../systems/skills";
import { deriveRegionLabel } from "./sprites";

export function buildObserverSnapshot(
  world: World<GameEntity>,
  day: number,
): ObserverSnapshot {
  const station = (() => {
    for (const w of world.query("weatherStation")) return w.weatherStation;
    return null;
  })();

  const greenhouseOwners = new Set<number>();
  for (const g of world.query("greenhouse")) greenhouseOwners.add(g.greenhouse.ownerId);

  const farmerEntries: ObserverSnapshot["farmers"] = [];
  for (const f of world.query("farmer", "inventory", "fsm", "ap", "personality")) {
    if (f.id === undefined) continue;
    const queue = f.intentions?.queue ?? [];
    farmerEntries.push({
      id: f.id,
      name: f.farmer.name,
      personality: f.personality.kind,
      gold: f.inventory.gold,
      crops: { ...f.inventory.crops },
      fsm: f.fsm.current,
      apCurrent: f.ap.current,
      apMax: f.ap.max,
      apPenaltyPending: f.ap.penaltyPending,
      region: deriveRegionLabel(
        f.farmer.name,
        f.farmer.currentRegion,
        f.farmer.path !== undefined,
      ),
      currentIntention: queue[0]?.kind ?? null,
      nextIntention: queue[1]?.kind ?? null,
      reasons: f.decisionTrace ? [...f.decisionTrace.reasons] : [],
      skills: {
        farming:  skillLevel(f.skills?.farming ?? 0),
        foraging: skillLevel(f.skills?.foraging ?? 0),
        fishing:  skillLevel(f.skills?.fishing ?? 0),
        mining:   skillLevel(f.skills?.mining ?? 0),
      },
      hasGreenhouse: greenhouseOwners.has(f.id),
    });
  }
  farmerEntries.sort((a, b) => a.id - b.id);

  return {
    day,
    season: station?.season ?? seasonForDay(day), 
    weather: {
      condition: station?.current ?? "normal",
      multiplier: station?.multiplier ?? 1,
    },
    forecast: (station?.forecast ?? []).map((f) => ({
      condition: f.condition,
      confidence: f.confidence,
    })),
    farmers: farmerEntries,
  };
}

export function countEntities(world: World<GameEntity>): number {
  let n = 0;
  for (const _ of world.query("transform")) n += 1;
  for (const _ of world.query("plot")) n += 1;
  return n;
}
