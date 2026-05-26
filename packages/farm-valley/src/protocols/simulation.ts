export const ONT_SIMULATION = {
  DAY_START: "day-start",
  DAY_END: "day-end",
  STATE_UPDATE: "state-update",
  REGISTER: "register",
} as const;

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
