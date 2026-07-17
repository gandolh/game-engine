import { createPersonalityRegistry, type DeliberationContext } from "@engine/core/agent";
import type { GameEntity } from "../components";

export type DeliberateContext = DeliberationContext;

export type DeliberateFn = (farmer: GameEntity, ctx: DeliberateContext) => void;

export const personalityRegistry = createPersonalityRegistry<GameEntity>();

export function registerPersonality(name: string, fn: DeliberateFn): void {
  personalityRegistry.register(name, fn);
}

export function getDeliberate(name: string): DeliberateFn | undefined {
  return personalityRegistry.get(name);
}
