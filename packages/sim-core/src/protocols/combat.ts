

export const ONT_COMBAT = {
  CHALLENGE: "combat.challenge",
  ACCEPT: "combat.accept",
  DECLINE: "combat.decline",
  RESULT: "combat.result",
} as const;

export type CombatOntology = (typeof ONT_COMBAT)[keyof typeof ONT_COMBAT];

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

export interface CombatResultBody {
  context: CombatContext;
  winnerId: number | null; 
  loserId: number | null;
  koed: boolean;
  fledId: number | null;
  looted: number; 
}
