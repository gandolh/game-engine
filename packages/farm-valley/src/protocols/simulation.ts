export const ONT_SIMULATION = {
  DAY_START: "day-start",
  DAY_END: "day-end",
  STATE_UPDATE: "state-update",
  REGISTER: "register",
  /** A one-time mid-game shock event (e.g. blight). Broadcast when it fires. */
  SHOCK: "shock",
} as const;

export type ShockKind = "blight";

export type SimulationOntology = (typeof ONT_SIMULATION)[keyof typeof ONT_SIMULATION];

export interface DayStartBody {
  day: number;
  daysRemaining: number;
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
