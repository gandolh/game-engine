// Combat ontologies. CHALLENGE/ACCEPT/DECLINE mirror the encounter handshake
// (FIPA-ACL style). RESULT is broadcast at bout end for the event-feed / drama.
export const ONT_COMBAT = {
  CHALLENGE: "combat.challenge",
  ACCEPT: "combat.accept",
  DECLINE: "combat.decline",
  RESULT: "combat.result",
} as const;

export type CombatOntology = (typeof ONT_COMBAT)[keyof typeof ONT_COMBAT];

/** Where/how a bout resolves. ring = teleport + gold stake + HP reset at bout end; street = in place + loot + flee. */
export type CombatContext = "ring" | "street";

export interface ChallengeBody {
  challengerId: number;
  context: CombatContext;
}

export interface CombatAcceptBody {
  challengerId: number;
  context: CombatContext;
}

export interface CombatDeclineBody {
  challengerId: number;
}

/** Broadcast when a bout ends. `looted` lists item units taken (street only). */
export interface CombatResultBody {
  context: CombatContext;
  winnerId: number | null; // null = forfeit / mutual exhaustion / flee (no winner)
  loserId: number | null;
  koed: boolean;
  fledId: number | null;
  looted: number; // count of goods units taken (street KO only)
}
