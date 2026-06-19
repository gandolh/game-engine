export interface ObserverSnapshot {
  day: number;
  season: string;
  weather: { condition: string; multiplier: number };
  forecast: Array<{ condition: string; confidence: number }>;
  farmers: Array<{
    id: number;
    name: string;
    personality: string;
    gold: number;
    crops: Partial<Record<import("../components").CropKind, number>>;
    fsm: string;
    apCurrent: number;
    apMax: number;
    apPenaltyPending: boolean;
    region: string;
    currentIntention: string | null;
    nextIntention: string | null;
    reasons: string[];
    skills: { farming: number; foraging: number; fishing: number; mining: number };
    hasGreenhouse: boolean;
  }>;
}

export interface FarmerRowEls {
  root: HTMLElement;
  name: HTMLElement;
  personality: HTMLElement;
  gold: HTMLElement;
  crops: HTMLElement;
  fsm: HTMLElement;
  ap: HTMLElement;
  region: HTMLElement;
  skills: HTMLElement;
  why: HTMLElement;
  whyBody: HTMLElement;
}
