/**
 * FIPA-ACL performatives — the game-agnostic speech-act vocabulary agents tag
 * messages with (mirrors the SPADE prototype). The message bus stores
 * `performative` as a free-form string; these are the canonical values agent
 * protocols (contract-net trade, CFP auctions, …) use across games.
 */
export const PERFORMATIVE = {
  INFORM: "INFORM",
  REQUEST: "REQUEST",
  PROPOSE: "PROPOSE",
  ACCEPT: "ACCEPT",
  REJECT: "REJECT",
  CFP: "CFP",
  FAILURE: "FAILURE",
  REFUSE: "REFUSE",
} as const;

export type Performative = (typeof PERFORMATIVE)[keyof typeof PERFORMATIVE];
