import type { With } from "@engine/core";
import type { GameEntity } from "../../components";

/** Narrowed from `query("fsm", "intentions", "inventory")` — handlers can skip re-guarding those fields. */
export type ActingFarmer = With<GameEntity, "fsm" | "intentions" | "inventory">;

export interface ActContext {
  plotsByOwner: Map<number, GameEntity[]>;
  occupiedByOwner: Map<number, Set<string>>;
  featuresByTile: Map<string, GameEntity>;
  fountainByRegion: Map<string, GameEntity>;
  bubbleTiles: ReadonlySet<string>;
  blacksmithId: number | undefined;
  marketWallId: number | undefined;
  shopkeeperId: number | undefined;
}
