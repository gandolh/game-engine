/**
 * Resource nodes — the town's finite, spatially-located wealth. A node holds
 * a `stock` that depletes when harvested and renews by `regenPerTick` each
 * tick (clamped to `maxStock`). Nodes are plain world data, not ECS entities
 * (there is nothing agent-like about a resource node — no FSM, no
 * deliberation — so putting them in the `World` would only cost a query scan
 * for no benefit); `ResourceWorld` is Hollow's own small registry, handed to
 * the systems and the deliberation context that need to look nodes up.
 *
 * Determinism: the ONLY randomness here is node placement, drawn from a
 * dedicated `Rng.fork("resource-node-placement")` at construction time.
 * Regeneration is a fixed `+regenPerTick` per tick — no further random draws
 * — so two `ResourceWorld`s built from the same parent `Rng` and options
 * produce byte-identical stock trajectories forever.
 */
import type { Rng } from "@engine/core";
import { GRID_SIZE } from "./grid";

export type ResourceKind = "food" | "material";

export interface ResourceNode {
  readonly id: number;
  readonly kind: ResourceKind;
  readonly gx: number;
  readonly gy: number;
  stock: number;
  readonly maxStock: number;
  readonly regenPerTick: number;
}

export interface ResourceWorldOptions {
  foodNodeCount: number;
  materialNodeCount: number;
  foodNodeMaxStock: number;
  foodNodeRegenPerTick: number;
  materialNodeMaxStock: number;
  materialNodeRegenPerTick: number;
}

export class ResourceWorld {
  readonly nodes: ResourceNode[] = [];
  private readonly byId = new Map<number, ResourceNode>();

  constructor(rng: Rng, opts: ResourceWorldOptions) {
    const placementRng = rng.fork("resource-node-placement");
    let nextId = 1;
    for (let i = 0; i < opts.foodNodeCount; i++) {
      this.addNode(nextId++, "food", placementRng, opts.foodNodeMaxStock, opts.foodNodeRegenPerTick);
    }
    for (let i = 0; i < opts.materialNodeCount; i++) {
      this.addNode(
        nextId++,
        "material",
        placementRng,
        opts.materialNodeMaxStock,
        opts.materialNodeRegenPerTick,
      );
    }
  }

  private addNode(
    id: number,
    kind: ResourceKind,
    placementRng: Rng,
    maxStock: number,
    regenPerTick: number,
  ): void {
    const node: ResourceNode = {
      id,
      kind,
      gx: placementRng.int(0, GRID_SIZE),
      gy: placementRng.int(0, GRID_SIZE),
      stock: maxStock,
      maxStock,
      regenPerTick,
    };
    this.nodes.push(node);
    this.byId.set(id, node);
  }

  getNode(id: number): ResourceNode | undefined {
    return this.byId.get(id);
  }

  /**
   * Nearest node of `kind` to (gx, gy) by squared Euclidean distance.
   * Iterates `nodes` in fixed creation order and only replaces the best
   * match on a STRICT improvement, so ties always resolve to the
   * lowest-id node — deterministic regardless of caller.
   */
  nearestNode(kind: ResourceKind, gx: number, gy: number): ResourceNode | undefined {
    let best: ResourceNode | undefined;
    let bestDist = Infinity;
    for (const node of this.nodes) {
      if (node.kind !== kind) continue;
      const dx = node.gx - gx;
      const dy = node.gy - gy;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }
    return best;
  }

  /** Removes up to `amount` from the node's stock; returns what was actually taken. */
  harvest(id: number, amount: number): number {
    const node = this.byId.get(id);
    if (!node || amount <= 0) return 0;
    const taken = Math.min(node.stock, amount);
    node.stock -= taken;
    return taken;
  }

  /** Advances every node's stock by one tick of regeneration. */
  regenTick(): void {
    for (const node of this.nodes) {
      if (node.stock < node.maxStock) {
        node.stock = Math.min(node.maxStock, node.stock + node.regenPerTick);
      }
    }
  }
}
