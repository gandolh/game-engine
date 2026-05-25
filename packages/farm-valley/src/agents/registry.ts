import type { GameEntity } from "../components";

export type DeliberateFn = (farmer: GameEntity, ctx: DeliberateContext) => void;

export interface DeliberateContext {
  tick: number;
}

const registry = new Map<string, DeliberateFn>();

export function registerPersonality(name: string, fn: DeliberateFn): void {
  if (registry.has(name)) {
    throw new Error(`Personality already registered: ${name}`);
  }
  registry.set(name, fn);
}

export function getDeliberate(name: string): DeliberateFn | undefined {
  return registry.get(name);
}

export function listPersonalities(): readonly string[] {
  return Array.from(registry.keys()).sort();
}
