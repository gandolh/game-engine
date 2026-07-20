/**
 * Social ontology (chunk hollow-06a) — the ONT_* + typed-body pattern used
 * by every other Hollow protocol (protocols/starvation.ts, protocols/family.ts).
 * `HollowSocialActSystem` (social/act-system.ts) emits exactly one of these
 * per verb it executes, broadcast (`recipient: "broadcast"`) so any consumer
 * (a later UI/metrics feed) can observe it without having to be subscribed
 * at the exact tick it fires — same rationale as ONT_FAMILY's header.
 *
 * RUMOR and STEAL_DETECTED are also CONSUMED within this package —
 * `social/witness-system.ts` subscribes to both to fold their third-party
 * (bystander) trust effects into every OTHER agent's relationship ledger,
 * not just the two direct parties'. Every other event here is emit-only for
 * this dispatch (nothing in hollow-06a subscribes to its own GIFT/SHARE/
 * HELP/TEACH/TRADE/STEAL/SABOTAGE/ATTACK events) — a seam for dispatch 6b's
 * deliberation or a later metrics/UI consumer, mirroring ONT_FAMILY's
 * "emit-only... a seam" note.
 */
export const ONT_SOCIAL = {
  GIFT: "social.gift",
  SHARE: "social.share",
  HELP: "social.help-labor",
  TEACH: "social.teach",
  TRADE: "social.trade",
  STEAL: "social.steal",
  STEAL_DETECTED: "social.steal-detected",
  SABOTAGE: "social.sabotage",
  RUMOR: "social.rumor",
  ATTACK: "social.attack",
} as const;

export type SocialOntology = (typeof ONT_SOCIAL)[keyof typeof ONT_SOCIAL];

/** `gift` — `amount` actually transferred (post-clamp-to-actor's-stock). */
export interface GiftBody {
  actorId: number;
  targetId: number;
  good: string;
  amount: number;
  tick: number;
}

/** `share` — `amount` actually contributed to the actor's community stockpile. */
export interface ShareBody {
  actorId: number;
  communityId: number;
  good: string;
  amount: number;
  tick: number;
}

/** `help_labor` — one work-cycle's worth of materials produced into the target. */
export interface HelpLaborBody {
  actorId: number;
  targetId: number;
  good: string;
  amount: number;
  tick: number;
}

/** `teach` — before/after so the transfer is inspectable, not just "it happened". */
export interface TeachBody {
  actorId: number;
  targetId: number;
  skill: string;
  before: number;
  after: number;
  tick: number;
}

/** `trade` — the settled (or rejected) offer, both sides. */
export interface TradeBody {
  actorId: number;
  targetId: number;
  offerGood: string;
  offerAmount: number;
  wantGood: string;
  wantAmount: number;
  accepted: boolean;
  tick: number;
}

/** `steal` — `amount` actually taken (post-clamp-to-target's-stock); `detected`
 *  mirrors whether `STEAL_DETECTED` also fired this same tick. */
export interface StealBody {
  actorId: number;
  targetId: number;
  good: string;
  amount: number;
  detected: boolean;
  tick: number;
}

/** A detected theft, broadcast so `social/witness-system.ts` can fan the
 *  trust hit out to bystanders. `actorGx`/`actorGy` snapshot the thief's
 *  position AT THE TIME of the theft (not re-read later, when the actor may
 *  have moved) — the position `witness-system.ts`'s proximity check uses. */
export interface StealDetectedBody {
  actorId: number;
  targetId: number;
  actorGx: number;
  actorGy: number;
  tick: number;
}

/** `sabotage` — `amountDestroyed` of the target's materials; `detected`
 *  gates the direct target->actor trust hit (no third-party fan-out for
 *  this verb — see social/constants.ts's header). */
export interface SabotageBody {
  actorId: number;
  targetId: number;
  good: string;
  amountDestroyed: number;
  detected: boolean;
  tick: number;
}

/** A spread rumor, broadcast so `social/witness-system.ts` can lower OTHER
 *  agents' trust toward `targetId`. `actorGx`/`actorGy` snapshot the
 *  rumor-spreader's position at the time, same rationale as
 *  `StealDetectedBody`. */
export interface RumorBody {
  actorId: number;
  targetId: number;
  actorGx: number;
  actorGy: number;
  tick: number;
}

/** `attack` — `lethal` gates whether `target.beliefs.data.violentDeath` was
 *  set (the hollow-05 lifecycle seam — see family/lifecycle-system.ts) or
 *  only a trust hit landed. */
export interface AttackBody {
  actorId: number;
  targetId: number;
  lethal: boolean;
  tick: number;
}
