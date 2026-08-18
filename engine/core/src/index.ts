export * from "./runtime";
export * from "./commands";
export * from "./placement";
export * from "./ecs";
export * from "./sim";
export * from "./agent";
export * from "./render";
// `./ecs` (the `Sprite` ECS component) and `./render` (the render-vocabulary
// `Sprite` from `sprite-types.ts`) both export a type named `Sprite`. Resolve the
// ambiguity explicitly in favour of the ECS component, matching this barrel's
// pre-existing behaviour — the render `Sprite` remains reachable via the
// `@engine/core/render` subpath (as it already is for other render-only types).
export type { Sprite } from "./ecs";
export * from "./assets";
export * from "./debug";
export * from "./wasm";
export * from "./input";
export * from "./animation";
