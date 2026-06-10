export interface ObserverSnapshot {
  day: number;
  /** Current season name (brief 22 — seasons / weather arcs). */
  season: string;
  weather: { condition: string; multiplier: number };
  forecast: Array<{ condition: string; confidence: number }>;
  farmers: Array<{
    id: number;
    name: string;
    personality: string;
    gold: number;
    /** brief 41 — all crop kind counts (sparse: missing = 0). */
    crops: Partial<Record<import("../components").CropKind, number>>;
    fsm: string;
    apCurrent: number;
    apMax: number;
    apPenaltyPending: boolean;
    region: string;
    // brief 19 — decision rationale trace ("why"), shown for the focused farmer.
    currentIntention: string | null;
    nextIntention: string | null;
    reasons: string[];
    /** brief 43 — per-axis skill levels (farming/foraging/fishing/mining). */
    skills: { farming: number; foraging: number; fishing: number; mining: number };
    /** brief 43 — true if the farmer has built a greenhouse. */
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
  // brief 43 — per-farm skill levels line.
  skills: HTMLElement;
  // brief 19 — decision rationale ("why"); only populated for the focused farmer.
  why: HTMLElement;
  // discoverability: the body text under the bold "Why:" header (separate so the
  // header stays a static bold child and only the trace text updates).
  whyBody: HTMLElement;
}
