/**
 * Feud — a persistent, DIRECTED grudge ledger (chunk hollow-12b): "how much
 * does THIS agent resent peer X right now", accrued by harm (a detected
 * steal/sabotage, a rumor, an attack) done TO this agent BY that peer, and
 * reduced by passive decay or a genuine cooperative gesture FROM that peer
 * (see `social/feud-system.ts`'s `HollowFeudSystem`, which owns every
 * mutation of this ledger). Mirrors the engine's own generic
 * `RelationshipLedger` shape (`@engine/core/agent`'s relationship.ts)
 * one-for-one — a plain `Map<number, number>` keyed by peer id — but is a
 * HOLLOW-owned component (not an engine one; the engine never names a game,
 * per CLAUDE.md) since "grudge" is a Hollow-specific antagonism-arc concept,
 * distinct from the engine's generic trust primitive `relationships` already
 * carries on every entity. The two ledgers are deliberately SEPARATE (not a
 * repurposed `relationships` entry): trust is a broad "how do I feel about
 * you" scalar nudged by almost everything (proximity, every social verb,
 * governance sanctions); a feud is specifically "do I hold an active grudge
 * worth ACTING on", gated by its own start/reconcile thresholds so it can
 * drive deliberate escalation/reconciliation arcs without every ordinary
 * trust dip reading as one.
 *
 * Scale: `[0, FEUD_MAX]` (`social/feud-constants.ts`), 0 = no grudge. Unlike
 * `RelationshipLedger`'s neutral-midpoint (0.5) trust scale, there is no
 * "neutral" grudge value — an absent entry (or a value of 0) simply means no
 * accrued resentment toward that peer, which is why `relationshipScore`'s
 * `scale.neutral` fallback idiom isn't reused here; every reader instead
 * defaults a missing entry to plain `0` (see `feud-system.ts` and
 * `agents/social-verbs.ts`).
 *
 * Seeded EMPTY (`makeFeud()`) on every spawned agent — founders
 * (`population.ts`) and newborns (`family/reproduction-system.ts`) — right
 * alongside `relationships`/`skills`, and mutates no `Rng` (pure bookkeeping
 * — see `feud-system.ts`'s determinism note). Optional on `HollowEntity`
 * only because the type is shared with pre-hollow-12b hand-built test
 * harnesses that construct entities without it (same rationale as
 * `skills`/`genome` — components/entity.ts); every consumer reads it
 * DEFENSIVELY (`agent.feud?.byId.get(peerId) ?? 0`), same convention as
 * `Skills`/`ensureSkills` (social/act-system.ts).
 */
export interface Feud {
  byId: Map<number, number>;
}

/** A fresh, empty grudge ledger — no peer has ever wronged this agent yet. */
export function makeFeud(): Feud {
  return { byId: new Map() };
}
