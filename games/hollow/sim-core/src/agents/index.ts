export { personalityRegistry, registerPersonality, buildNeighborIndex, buildCorpseIndex, buildSickIndex } from "./registry";
export type {
  HollowDeliberationContext,
  HollowDeliberator,
  NeighborView,
  CorpseTargetView,
  SickTargetView,
} from "./registry";
export { VILLAGER_KIND } from "./villager";
export { chooseSocialAction } from "./social-verbs";
export type { ScoredChoice, SocialAgent } from "./social-verbs";

// Side-effecting import: registers the "villager" deliberator on
// `personalityRegistry` (mirrors @farm/sim-core's `import "./agents/conservative"`
// pattern in sim-bootstrap.ts). Anything importing `./agents` (or
// sim-bootstrap, which imports this) gets the registration for free.
import "./villager";
