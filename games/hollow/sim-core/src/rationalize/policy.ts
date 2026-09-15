/**
 * THE POLICY GATE (chunk hollow-13) — "is this decision significant enough
 * to spend a consultation on?"
 *
 * Pure, allocation-free, and O(candidates) over a set that is at most nine
 * long (`agents/social-verbs.ts`'s `VERB_ORDER`), because it runs on EVERY
 * deliberation of every agent of every tick. Anything expensive belongs
 * further in, after this said yes.
 *
 * ── mapping the spec's list onto this codebase ────────────────────────────
 * The spec names "join/leave community, betray, pair-bond, sanction, large
 * trade". Three of those are not decisions a Hollow DELIBERATOR makes at
 * all: community join/leave is decided by the COMMUNITY-stage crystallize
 * pass from trust topology (`community/crystallize-system.ts`), pair-bonding
 * by the PAIRBOND stage from mutual trust + compatibility
 * (`family/pair-bond-system.ts`), and sanctions by the GOVERNANCE stage
 * (`governance/governance-system.ts`). None of them is ever an entry in an
 * agent's intention queue, so none of them is reachable from this seam,
 * which sits at the deliberation boundary. Extending the seam to those
 * system-driven passes would need its own candidate-enumeration work and is
 * deliberately out of scope here — recorded so the next reader doesn't
 * assume it was an oversight.
 *
 * What IS reachable is the social-verb set, and there the analogues are
 * exact: "betray" is the four antagonistic verbs (a steal, a sabotage, an
 * attack, a rumor all break trust with a specific named peer and all feed
 * the persistent grudge ledger), and "large trade" is `trade` (the only verb
 * that moves goods BOTH ways under a negotiated shape).
 */
import type { ScoredChoice } from "../agents/social-verbs";

/**
 * The verbs a consultation is worth spending on — an explicit, named,
 * exported set, NOT an inline literal, so chunk 4's provider budgeting and
 * chunk 3's chronicle can both reason about the same list and a future brief
 * can widen it in one place.
 *
 * Present, and why:
 *  - `steal`, `sabotage`, `attack`, `rumor` — the antagonistic four. Each
 *    names a victim, each moves trust down, each writes the feud ledger.
 *    These are the decisions whose STATED reason is most worth comparing
 *    against the revealed one (the spec's research interest), and the ones
 *    with real, durable consequences for another agent.
 *  - `trade` — the spec's "large trade": a two-sided goods transfer the
 *    counterparty can refuse.
 *
 * Absent, and why: `gift`, `share`, `help_labor`, `teach` are one-sided,
 * low-stakes, high-frequency prosocial acts. They fire constantly, cost the
 * actor a bounded surplus, and harm nobody — consulting on them would burn
 * most of the budget on the least interesting decisions in the run.
 */
export const SIGNIFICANT_SOCIAL_VERBS: ReadonlySet<string> = new Set([
  "steal",
  "sabotage",
  "attack",
  "rumor",
  "trade",
]);

/**
 * `true` when ANY option on the table is a significant verb.
 *
 * Deliberately "any candidate", not "the BDI default": the point of the seam
 * is that the model may pick something the substrate ranked second, so a
 * decision where betrayal is *available* is significant even when the
 * substrate was about to trade instead. The converse — a set of only gifts
 * and teaching — is never worth a call, whichever one wins.
 *
 * An empty set is never significant (there is nothing to choose among, and
 * no request is issued for one).
 */
export function isSignificantDecision(candidates: readonly ScoredChoice[]): boolean {
  for (const choice of candidates) {
    if (SIGNIFICANT_SOCIAL_VERBS.has(choice.kind)) return true;
  }
  return false;
}
