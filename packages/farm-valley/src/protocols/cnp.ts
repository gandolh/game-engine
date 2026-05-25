import type { CropKind } from "../components";

export const ONT_CNP = {
  TASK: "cnp-task",
  PROPOSE: "cnp-propose",
  ACCEPT: "cnp-accept",
  REJECT: "cnp-reject",
  COMPLETED: "cnp-completed",
} as const;

export type CnpOntology = (typeof ONT_CNP)[keyof typeof ONT_CNP];

export interface CnpTaskBody {
  taskId: string;
  initiatorId: number;
  buyCrop: CropKind;
  quantity: number;
  maxPricePerUnit: number;
  deadlineTick: number;
}

export interface CnpProposeBody {
  taskId: string;
  bidderId: number;
  pricePerUnit: number;
  quantity: number;
}

export interface CnpAcceptBody {
  taskId: string;
}

export interface CnpRejectBody {
  taskId: string;
}

export interface CnpCompletedBody {
  taskId: string;
  ok: boolean;
}
