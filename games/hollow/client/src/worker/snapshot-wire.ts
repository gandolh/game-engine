/**
 * The snapshot as it crosses the worker boundary (corpus brief 18). `postMessage` copies a plain object
 * with structured clone; a typed array in the transfer list is moved instead, so the per-agent grid
 * positions travel as one `Float32Array` and the object keeps only what is not a number to draw with
 * (kinds, needs, appearance, action labels, the other lists).
 *
 * The sim's own `HollowSnapshot` and `getSnapshot()` are unchanged: headless tools and the sim tests
 * read them. Only the worker packs, and only the client reads the packed form.
 */
import type { HollowAgentSnapshot, HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";

/** An agent as posted: the snapshot's agent without its position, which lives in the typed array. */
export type WireAgent = Omit<HollowAgentSnapshot, "gx" | "gy">;

/** A snapshot as posted: every field but each agent's position. */
export interface WireSnapshot extends Omit<HollowSnapshot, "agents"> {
  readonly agents: readonly WireAgent[];
}

/** Packed grid positions, two floats an agent: `[gx0, gy0, gx1, gy1, …]` in `snapshot.agents` order. */
export interface PackedSnapshot {
  snapshot: WireSnapshot;
  agentPositions: Float32Array;
}

/**
 * Splits a snapshot into the plain object and a fresh position array. The array is new on every call: it
 * goes in the transfer list, which detaches it from the worker, so a buffer reused across ticks would be
 * a zero-length view on the second post.
 */
export function packSnapshot(snap: HollowSnapshot): PackedSnapshot {
  const n = snap.agents.length;
  const agentPositions = new Float32Array(n * 2);
  const agents: WireAgent[] = new Array<WireAgent>(n);
  for (let i = 0; i < n; i++) {
    const { gx, gy, ...rest } = snap.agents[i] as HollowAgentSnapshot;
    agentPositions[i * 2] = gx;
    agentPositions[i * 2 + 1] = gy;
    agents[i] = rest;
  }
  return { snapshot: { ...snap, agents }, agentPositions };
}

/** Reads agent `index`'s grid position out of the packed array. */
export function agentPosition(positions: Float32Array, index: number): { gx: number; gy: number } {
  return { gx: positions[index * 2] ?? 0, gy: positions[index * 2 + 1] ?? 0 };
}
