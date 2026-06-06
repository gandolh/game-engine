// Barrel — re-exports every symbol the old components.ts exported.
// Consumers import from "../components" (or "../../components") unchanged.

export * from "./farmer";
export * from "./crops";
export * from "./tools";
export * from "./fish";
export * from "./inventory";
export * from "./livestock";
export * from "./orchard";
export * from "./skills";
export * from "./world-features";
export * from "./trust";
// entity.ts re-exports GameEntity + resetDecisionTrace + recordReason
export * from "./entity";
