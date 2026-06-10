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
  skills: HTMLElement;
  why: HTMLElement;
  // Body text under the bold "Why:" header (separate so the header stays static).
  whyBody: HTMLElement;
}
