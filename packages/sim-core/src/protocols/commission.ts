

import type { DecorationKind } from "../components";

export const ONT_COMMISSION = {

  BUILD: "commission-build",

  DONE: "commission-done",
} as const;

export type CommissionOntology = (typeof ONT_COMMISSION)[keyof typeof ONT_COMMISSION];

export interface CommissionBuildBody {

  kind: DecorationKind;
}

export interface CommissionDoneBody {
  ok: boolean;
  kind: DecorationKind;

  reason?: string;
}
