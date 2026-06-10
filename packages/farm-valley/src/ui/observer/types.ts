// Re-export of the ObserverSnapshot data type, which now lives in @farm/sim-core
// (it is part of the RenderSnapshot contract the sim host produces). The observer
// DOM panel stays here in the renderer and imports the type from this barrel.
export type { ObserverSnapshot } from "@farm/sim-core/snapshot";

/** DOM element handles for one farmer row in the observer panel (renderer-only). */
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
