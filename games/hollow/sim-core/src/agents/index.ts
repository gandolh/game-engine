export { personalityRegistry, registerPersonality } from "./registry";
export type { HollowDeliberationContext, HollowDeliberator } from "./registry";
export { VILLAGER_KIND } from "./villager";

// Side-effecting import: registers the "villager" deliberator on
// `personalityRegistry` (mirrors @farm/sim-core's `import "./agents/conservative"`
// pattern in sim-bootstrap.ts). Anything importing `./agents` (or
// sim-bootstrap, which imports this) gets the registration for free.
import "./villager";
