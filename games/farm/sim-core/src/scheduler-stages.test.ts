

import { describe, it, expect } from "vitest";
import { bootstrapSim } from "./sim-bootstrap";
import { JsPathfinder } from "./world/js-pathfinder";
import type { StageEntry } from "@engine/core";

const EXPECTED_STAGES: StageEntry[] = [
  { stage: "CLOCK",      name: "DayClockSystem" },
  { stage: "CLOCK",      name: "ShockSystem" },
  { stage: "DISPATCH",   name: "WeatherSystem" },
  { stage: "DISPATCH",   name: "InboxDispatchSystem" },
  { stage: "DISPATCH",   name: "ShopSlateSystem" },
  { stage: "DISPATCH",   name: "NoticeBoardSystem" },
  { stage: "SNOOP",      name: "EncounterSystem" },
  { stage: "SNOOP",      name: "EncounterTradeSystem" },
  { stage: "SNOOP",      name: "MeetIndicatorSystem" },
  { stage: "SNOOP",      name: "TrustSystem" },
  { stage: "SNOOP",      name: "RivalrySystem" },
  { stage: "SNOOP",      name: "FestivalSystem" },
  { stage: "SNOOP",      name: "HarborSystem" },
  { stage: "SNOOP",      name: "EventFeedSystem" },
  { stage: "SNOOP",      name: "TavernSystem" },
  { stage: "SNOOP",      name: "RunHistorySystem" },
  { stage: "PERCEIVE",   name: "PerceiveSystem" },
  { stage: "GROW",       name: "CropGrowthSystem" },
  { stage: "GROW",       name: "TileFeatureSystem" },
  { stage: "GROW",       name: "BubbleSystem" },
  { stage: "GROW",       name: "HarvestSystem" },
  { stage: "GROW",       name: "LivestockSystem" },
  { stage: "GROW",       name: "OrchardSystem" },
  { stage: "GROW",       name: "PlotSenseSystem" },
  { stage: "DELIBERATE", name: "DeliberateSystem" },
  { stage: "DELIBERATE", name: "PlayerControlSystem" },
  { stage: "DELIBERATE", name: "AggressionSystem" },
  { stage: "DELIBERATE", name: "ApSystem" },
  { stage: "MOVE",       name: "FeatureCollisionSystem" },
  { stage: "MOVE",       name: "ChaseSystem" },
  { stage: "MOVE",       name: "TravelSystem" },
  { stage: "ACT",        name: "ActSystem" },
  { stage: "ACT",        name: "MarketSystem" },
  { stage: "ACT",        name: "ShopkeeperSystem" },
  { stage: "ACT",        name: "AuctionSystem" },
  { stage: "ACT",        name: "CarpenterSystem" },
  { stage: "ACT",        name: "NpcDeliberateSystem" },
  { stage: "ACT",        name: "WorkNpcSystem" },
  { stage: "ACT",        name: "CombatSystem" },
  { stage: "ACT",        name: "FinishDaySystem" },
];

describe("scheduler stage order pin", () => {
  it("bootstrapSim(+JsPathfinder) produces exactly the expected stage/name sequence", () => {
    const sim = bootstrapSim({
      seed: 1,
      ticksPerDay: 20,
      maxDays: 5,
      pathfinder: new JsPathfinder(),
    });
    expect(sim.scheduler.stages()).toEqual(EXPECTED_STAGES);
  });
});

describe("stage audit on real scheduler", () => {
  it(
    "runs several ticks with audit enabled without throwing (real ordering is clean)",
    { timeout: 30_000 },
    () => {
      const sim = bootstrapSim({
        seed: 0xc0ffee,
        ticksPerDay: 20,
        maxDays: 5,
        pathfinder: new JsPathfinder(),
      });

      sim.bus.enableAudit();
      sim.scheduler.enableStageAudit(sim.bus);

      expect(() => {
        for (let tick = 0; tick < 60; tick++) {
          sim.scheduler.tick({ tick });
          sim.bus.notifySubscribers();
        }
      }).not.toThrow();
    },
  );
});
