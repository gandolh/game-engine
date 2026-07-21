/**
 * LineageRegistry — a PERMANENT record of every agent ever spawned (chunk
 * hollow-05), mirroring `community/registry.ts`'s `CommunityRegistry`
 * plain-data-registry pattern but never removing entries: the ECS `World`
 * despawns an agent's live components once it dies (keeping the world
 * bounded — see family/lifecycle-system.ts), but ancestry/genealogy must
 * stay queryable forever after that — this registry is where "forever"
 * lives.
 *
 * Ids mirror the ECS entity id (the caller passes in the `World.spawn`-
 * assigned id) rather than a separate counter — unlike `CommunityRegistry`,
 * an agent and its lineage entry must share one identity so a snapshot's
 * `id` can look either up.
 *
 * Determinism: `record`/`markDeath` are simple keyed writes (no `Rng`
 * needed); `all()` sorts ascending by id like every other registry in this
 * package, never trusting `Map.values()` insertion order.
 */
import type { Genome } from "../components";

export type DeathCause = "oldAge" | "starvation" | "violence" | "disease";

export interface LineageEntry {
  readonly id: number;
  readonly genome: Genome;
  /** `null` for founders (population.ts) — nothing recorded to be kin to. */
  readonly parents: readonly [number, number] | null;
  readonly birthTick: number;
  deathTick: number | null;
  deathCause: DeathCause | null;
  /** Communities this agent was ever a member of, in join order — a seam
   *  for a later brief's genealogy/metrics export; nothing in hollow-05
   *  appends to this yet (community membership tracking lives entirely in
   *  `communityId` + `CommunityRegistry` today). */
  readonly communityHistory: number[];
}

export interface RecordLineageInput {
  id: number;
  genome: Genome;
  parents: readonly [number, number] | null;
  birthTick: number;
}

export class LineageRegistry {
  private readonly byId = new Map<number, LineageEntry>();

  record(entry: RecordLineageInput): LineageEntry {
    const rec: LineageEntry = {
      id: entry.id,
      genome: entry.genome,
      parents: entry.parents,
      birthTick: entry.birthTick,
      deathTick: null,
      deathCause: null,
      communityHistory: [],
    };
    this.byId.set(entry.id, rec);
    return rec;
  }

  markDeath(id: number, tick: number, cause: DeathCause): void {
    const rec = this.byId.get(id);
    if (!rec) return;
    rec.deathTick = tick;
    rec.deathCause = cause;
  }

  get(id: number): LineageEntry | undefined {
    return this.byId.get(id);
  }

  /** All lineage entries ever recorded (living or dead), sorted ascending
   *  by id — the only iteration order any caller should use. */
  all(): LineageEntry[] {
    return [...this.byId.values()].sort((a, b) => a.id - b.id);
  }

  /**
   * True if `a` and `b` share at least one recorded parent, or one is the
   * other's parent — the v1 kin-avoidance rule for pair-bonding (chunk
   * hollow-05). Founders (`parents: null`) are never kin to anyone by this
   * rule (there's nothing recorded to share). An id not present in the
   * registry is treated as not-kin (defensive — every spawned agent is
   * always recorded, see population.ts / family/reproduction-system.ts).
   */
  areCloseKin(a: number, b: number): boolean {
    if (a === b) return true;
    const ea = this.byId.get(a);
    const eb = this.byId.get(b);
    if (!ea || !eb) return false;
    if (ea.parents && ea.parents.includes(b)) return true; // b is a's parent
    if (eb.parents && eb.parents.includes(a)) return true; // a is b's parent
    if (ea.parents && eb.parents) {
      const [pa1, pa2] = ea.parents;
      const [pb1, pb2] = eb.parents;
      if (pa1 === pb1 || pa1 === pb2 || pa2 === pb1 || pa2 === pb2) return true; // shared parent
    }
    return false;
  }

  /**
   * Maximum generational depth reached by any recorded lineage entry
   * (founders = generation 0; a founder's child = generation 1; a
   * grandchild = generation 2; ...) — used by the M1 acceptance gate
   * ("dynasties emerge") to confirm multi-generation descent actually
   * happened, not just "some births occurred". Recomputed on demand (O(n)
   * over recorded entries, memoized per call) rather than tracked
   * incrementally, since it's queried by tests/metrics, not the hot
   * per-tick path.
   *
   * Recursion always terminates at a founder: a child is only ever
   * `record()`ed by family/reproduction-system.ts AFTER both its parents
   * already exist in this registry, so there is no cycle to guard against.
   */
  generationsOfDescent(): number {
    const memo = new Map<number, number>();
    const genOf = (id: number): number => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      const rec = this.byId.get(id);
      if (!rec || !rec.parents) {
        memo.set(id, 0);
        return 0;
      }
      const [pa, pb] = rec.parents;
      const gen = 1 + Math.max(genOf(pa), genOf(pb));
      memo.set(id, gen);
      return gen;
    };
    let max = 0;
    for (const id of this.byId.keys()) {
      max = Math.max(max, genOf(id));
    }
    return max;
  }
}
