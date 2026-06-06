import type { With } from "@engine/core";
import type { GameEntity } from "../../components";

/**
 * A farmer currently being processed by run(): narrowed to the components the
 * run() query guarantees (`query("fsm", "intentions", "inventory")`), so the
 * extracted handlers can read these fields without re-guarding for undefined.
 */
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
