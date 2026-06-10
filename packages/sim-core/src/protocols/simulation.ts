export const ONT_SIMULATION = {
  DAY_START: "day-start",
  DAY_END: "day-end",
  STATE_UPDATE: "state-update",
  REGISTER: "register",
  /** A one-time mid-game shock event (e.g. blight). Broadcast when it fires. */
  SHOCK: "shock",
  /** brief 27 — start of an intra-day phase (morning/work/evening/night). */
  PHASE_START: "phase-start",
  /** brief 29 — a planted crop withered from lack of water. */
  CROP_DEATH: "crop-death",
} as const;

export type ShockKind = "blight";

export type SimulationOntology = (typeof ONT_SIMULATION)[keyof typeof ONT_SIMULATION];

export interface DayStartBody {
  day: number;
  daysRemaining: number;
}

/** brief 27 — emitted at each intra-day phase boundary. */
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
  /** Farmer entity id struck by the shock. */
  targetFarmerId: number;
  /** Farmer display name (for narration). */
  targetName: string;
  /** How many planted plots were wiped. */
  plotsWiped: number;
}

/** brief 29 — a crop withered from neglect (no water past the grace window). */
export interface CropDeathBody {
  day: number;
  ownerId: number;
  /** brief 41 — extended to all crop kinds. */
  crop: import("../components").CropKind;
}
