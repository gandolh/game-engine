export const PERFORMATIVE = {
  INFORM: "INFORM",
  REQUEST: "REQUEST",
  PROPOSE: "PROPOSE",
  ACCEPT: "ACCEPT",
  REJECT: "REJECT",
  CFP: "CFP",
} as const;

export const ONTOLOGY = {
  DAY_START: "day-start",
  DAY_END: "day-end",
  WEATHER_NOW: "weather-now",
  STATE_UPDATE: "state-update",
} as const;

export type Performative = (typeof PERFORMATIVE)[keyof typeof PERFORMATIVE];
export type Ontology = (typeof ONTOLOGY)[keyof typeof ONTOLOGY];

export interface DayStartBody {
  day: number;
}

export interface WeatherBody {
  condition: "sunny" | "normal" | "rainy" | "storm";
  multiplier: number;
}
