/**
 * RoadConnectivitySystem — marks buildings reachable from any storehouse as
 * connected. A building is connected if a road-or-building tile path exists
 * from a storehouse footprint to the building's footprint.
 *
 * Only recomputes when `state.connectivityDirty` is set (placement / demolish).
 * Deterministic: a pure flood-fill over the (deterministic) road + footprint
 * grid.
 *
 * Stage: "connectivity" (after commands).
 */
import type { System, SimContext } from "@engine/core";
import { getProductionDef } from "../entities/building";
import type { SimState } from "../sim-state";

export class RoadConnectivitySystem implements System {
  readonly name = "RoadConnectivitySystem";

  constructor(private readonly state: SimState) {}

  run(_ctx: SimContext): void {
    const state = this.state;
    if (!state.connectivityDirty) return;
    state.connectivityDirty = false;

    const { width, height } = state;
    // reachable[idx] = true if a road/building tile is reachable from a store.
    const reachable = new Uint8Array(width * height);

    // Seed the flood with all storehouse footprint tiles.
    const queue: number[] = [];
    for (const entity of state.buildingWorld.query("building")) {
      const id = entity.id;
      if (id === undefined) continue;
      const def = getProductionDef(entity.building.type);
      if (def?.isStorage !== true) continue;
      const b = entity.building;
      for (let dy = 0; dy < b.h; dy++) {
        for (let dx = 0; dx < b.w; dx++) {
          const tx = b.x + dx;
          const ty = b.y + dy;
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
          const idx = ty * width + tx;
          if (reachable[idx] === 0) {
            reachable[idx] = 1;
            queue.push(idx);
          }
        }
      }
    }

    // Flood through road tiles + building-footprint tiles (4-neighbour).
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head]!;
      head++;
      const cx = cur % width;
      const cy = (cur - cx) / width;
      const tryTile = (nx: number, ny: number): void => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const nIdx = ny * width + nx;
        if (reachable[nIdx] === 1) return;
        const isRoad = state.roadGrid[nIdx] === 1;
        const isBuilding = state.buildingTiles.has(nIdx);
        if (!isRoad && !isBuilding) return;
        reachable[nIdx] = 1;
        queue.push(nIdx);
      };
      tryTile(cx, cy - 1);
      tryTile(cx + 1, cy);
      tryTile(cx, cy + 1);
      tryTile(cx - 1, cy);
    }

    // Update each building's connected flag: connected if ANY of its footprint
    // tiles is reachable. Storehouses are always connected (they are seeds).
    for (const entity of state.buildingWorld.query("building")) {
      const id = entity.id;
      if (id === undefined) continue;
      const rs = state.buildingState.get(id);
      if (rs === undefined) continue;
      const b = entity.building;
      let connected = false;
      for (let dy = 0; dy < b.h && !connected; dy++) {
        for (let dx = 0; dx < b.w; dx++) {
          const tx = b.x + dx;
          const ty = b.y + dy;
          if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
          if (reachable[ty * width + tx] === 1) {
            connected = true;
            break;
          }
        }
      }
      rs.connected = connected;
    }
  }
}
