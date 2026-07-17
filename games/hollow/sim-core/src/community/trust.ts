/**
 * Deterministic trust-graph helpers used by `crystallize-system.ts`'s
 * community-detection passes. This is the highest determinism-risk surface
 * in the chunk (per the brief) — every function here is written so its
 * output is a pure function of its (id-keyed) inputs, NEVER of Map/Set
 * iteration order:
 *
 *  - `connectedComponents` and `density` take `ids` and always sort a local
 *    copy ascending before doing anything positional (choosing a BFS start,
 *    iterating pairs).
 *  - BFS always starts from the lowest unvisited id and visits candidate
 *    neighbors in ascending id order, so which agent "discovers" a
 *    component and the resulting component list are both reproducible.
 *  - `distributeEvenly`'s remainder always goes to the FIRST entries of
 *    whatever order the caller passes (callers pass ascending-id order),
 *    never to an arbitrary/incidental one.
 *
 * No `Rng` fork is used here. Every tie in this module (which agent starts
 * a BFS, which half of a split keeps the original community id, which
 * members receive a stockpile-split remainder) is broken by sorted agent
 * id, not a coin flip — there is no case in this chunk's dynamics where two
 * outcomes are equally deterministically valid and a genuine random
 * decision is needed. (Different SEEDS still produce different community
 * structures — see sim-bootstrap.community.test.ts — because the trust
 * graph itself is shaped by seeded population positions/rates via the
 * existing `Rng.fork` calls in population.ts/resources.ts, not because this
 * module draws its own randomness.)
 */
import { relationshipScore } from "@engine/core/agent";
import type { HollowEntity } from "../components";

type TrustCarrier = HollowEntity & {
  id: number;
  relationships: NonNullable<HollowEntity["relationships"]>;
};

/** Average of both directed scores between `a` and `b` — the "mutual
 *  trust" used for edge tests in community detection, so a one-sided crush
 *  can't alone glue two agents into a cluster. */
export function mutualTrust(a: TrustCarrier, b: TrustCarrier): number {
  return (relationshipScore(a.relationships, b.id) + relationshipScore(b.relationships, a.id)) / 2;
}

/**
 * Deterministic connected-components over `ids` under the symmetric
 * predicate `hasEdge`. Returns components sorted by their lowest member id,
 * each component's own members sorted ascending.
 */
export function connectedComponents(
  ids: readonly number[],
  hasEdge: (a: number, b: number) => boolean,
): number[][] {
  const sorted = [...ids].sort((x, y) => x - y);
  const visited = new Set<number>();
  const components: number[][] = [];
  for (const start of sorted) {
    if (visited.has(start)) continue;
    visited.add(start);
    const queue: number[] = [start];
    const comp: number[] = [];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const other of sorted) {
        if (visited.has(other)) continue;
        if (hasEdge(cur, other)) {
          visited.add(other);
          queue.push(other);
        }
      }
    }
    comp.sort((x, y) => x - y);
    components.push(comp);
  }
  components.sort((x, y) => x[0]! - y[0]!);
  return components;
}

/** Fraction of all possible pairs within `ids` that satisfy the symmetric
 *  `hasEdge` predicate. 0 for fewer than 2 ids. */
export function density(ids: readonly number[], hasEdge: (a: number, b: number) => boolean): number {
  const n = ids.length;
  if (n < 2) return 0;
  const sorted = [...ids].sort((x, y) => x - y);
  let edges = 0;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (hasEdge(sorted[i]!, sorted[j]!)) edges++;
    }
  }
  const possible = (n * (n - 1)) / 2;
  return edges / possible;
}

/**
 * Splits `total` into `n` non-negative integer shares as evenly as
 * possible: `floor(total/n)` each, with the remainder (`total % n`) handed
 * one-each to the FIRST `remainder` entries of the returned array. The
 * caller must supply/consume this in a fixed, agreed order (ascending agent
 * id, throughout this package) so the remainder assignment is a
 * deterministic function of that order, not an incidental one.
 */
export function distributeEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}
