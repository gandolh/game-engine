export const ONT_SIMULATION = {
  DAY_START: "day-start",
  DAY_END: "day-end",
  STATE_UPDATE: "state-update",
  REGISTER: "register",

  SHOCK: "shock",

  PHASE_START: "phase-start",

  CROP_DEATH: "crop-death",
} as const;

export type ShockKind = "blight";

export type SimulationOntology = (typeof ONT_SIMULATION)[keyof typeof ONT_SIMULATION];

export interface DayStartBody {
  day: number;
  daysRemaining: number;
}

export interface PhaseStartBody {
  day: number;
  phase: "morning" | "work" | "evening" | "night";
}

export interface DayEndBody {
  day: number;
  senderId: number;
}

export interface StateUpdateBody {
  day: number;
  senderId: number;
  name: string;
  gold: number;
  inventoryValue: number;
}

export interface ShockBody {
  kind: ShockKind;
  day: number;

  targetFarmerId: number;

  targetName: string;

  plotsWiped: number;
}

export interface CropDeathBody {
  day: number;
  ownerId: number;
  crop: import("../components").CropKind;
}
