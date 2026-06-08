// Barrel — re-exports the full public surface of the watering helpers so that
// `import { ... } from "./watering"` continues to work without changes in any
// consumer (personality files, tests, etc.).

export type { WateringStyle } from "./shared";

export { deliberateRefillCan, deliberateWatering } from "./water";

export { deliberateBuyTool, deliberateTill, deliberateUpgrade } from "./tools";

export {
  deliberateResourceGather,
  deliberateMillVisit,
  deliberateSeasonalForage,
  deliberateResourceZoneVisit,
} from "./gather";

export {
  deliberatePlantNearby,
  deliberatePlantOrchard,
  deliberateHarvestFruit,
  deliberateGreenhousePlant,
  deliberateBuildGreenhouse,
} from "./plant";

export { deliberateBuildPen, deliberateBuyAnimal, deliberateTendPens } from "./livestock";

export { deliberateFishing } from "./fishing";

export { deliberateCoralFishing } from "./coral";

export {
  deliberateSellProducts,
  deliberateSellFruit,
  deliberatePeriodicMarketVisit,
} from "./commerce";

export {
  deliberateDecoration,
  deliberateEarlyVillageVisit,
  deliberateHireHelp,
  deliberateTavernGather,
  deliberateFestivalGather,
  deliberateCommissionBuild,
} from "./social";

export { deliberateHarborContract, deliberateDeliverContract } from "./harbor";

export { deliberateSleep } from "./misc";
