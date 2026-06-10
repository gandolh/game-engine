import { JsPathfinder } from "@farm/sim-core/world/js-pathfinder";
import type { PathfinderLike } from "./run-core";

/**
 * Create the pure-JS BFS pathfinder used for headless runs. Stateless and
 * deterministic — no WASM, no memory faults, identical paths on every call
 * with the same inputs. TravelSystem accepts it via PathfinderLike duck type.
 */
export function makePathfinder(): PathfinderLike {
  return new JsPathfinder();
}
