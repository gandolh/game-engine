/**
 * Starvation-onset — the scarcity → population-regulation signal
 * (hollow-03's job is only to emit it; hollow-05 decides what happens to an
 * agent once it fires — this brief must NOT despawn/kill agents).
 *
 * Edge-triggered: `HollowPerceiveSystem` broadcasts one `ONSET` message the
 * tick an agent's `food` need crosses into "starving" (consecutive ticks at
 * min >= `STARVATION_TICKS`), not every tick it stays there — the durable,
 * queryable state is the `beliefs.data.starving` flag (and the snapshot's
 * per-agent `starving` field), which any consumer can poll without needing
 * to have been subscribed at the exact onset tick.
 */
export const ONT_STARVATION = {
  ONSET: "starvation-onset",
} as const;

export type StarvationOntology = (typeof ONT_STARVATION)[keyof typeof ONT_STARVATION];

export interface StarvationOnsetBody {
  agentId: number;
  tick: number;
}
