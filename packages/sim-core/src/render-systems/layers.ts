
export const LAYER = {

  WHALE: 1,
  CORAL: 2,
  KELP: 2,
  JELLY: 3,
  TURTLE: 3,
  REEF_FISH: 4,

  BRIDGE: 3,
  DUCK: 6,

  ACTOR: 50,
  BUILDING: 50,
  DUCK_FLY: 60,
  BIRD: 60,
  MEET: 90,
  FOLLOW: 91,
} as const;

export type LayerName = keyof typeof LAYER;
