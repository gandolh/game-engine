// brief 44 — carpenter commission protocol.
//
// An agent commissions a build at the carpenter NPC: it sends a COMMISSION_BUILD
// order (decoration kind + the wood/gold it is willing to spend). The
// CarpenterSystem (NOT agent logic) validates the order, escrows the cost
// up-front, holds the job for a short build-time, then DELIVERS the structure
// (spawns the decoration on the farmer's farm) and replies COMMISSION_DONE.
//
// This mirrors the shop's order→fulfill pattern (ShopkeeperSystem.handleSell):
// an agent sends an order message; a SYSTEM validates + resolves it. FIPA-ACL
// style: REQUEST to commission, INFORM/FAILURE to confirm.

import type { DecorationKind } from "../components";

export const ONT_COMMISSION = {
  /** farmer → carpenter: please build me a decoration (REQUEST). */
  BUILD: "commission-build",
  /** carpenter → farmer: the commission was delivered (INFORM) or rejected (FAILURE). */
  DONE: "commission-done",
} as const;

export type CommissionOntology = (typeof ONT_COMMISSION)[keyof typeof ONT_COMMISSION];

export interface CommissionBuildBody {
  /** The decoration the farmer wants built on their farm. */
  kind: DecorationKind;
}

export interface CommissionDoneBody {
  ok: boolean;
  kind: DecorationKind;
  /** Reason on failure (e.g. "insufficient-wood", "boost-maxed", "no-free-tile"). */
  reason?: string;
}
