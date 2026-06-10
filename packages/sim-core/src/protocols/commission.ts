// Carpenter commission: agent REQUESTs a decoration build; CarpenterSystem validates + escrows cost + delivers; replies INFORM/FAILURE.

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
