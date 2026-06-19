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
