import { describe, it, expect } from "vitest";
import { World } from "@engine/core";
import type { GameEntity } from "../components";
import { findById } from "./entity-helpers";

describe("findById", () => {
  it("returns the entity when it carries every named component", () => {
    const world = new World<GameEntity>();
    const e = world.spawn({ inbox: { messages: [] } });
    expect(findById(world, e.id as number, "inbox")).toBe(e);
    expect(findById(world, e.id as number)).toBe(e);
  });

  it("returns undefined for an entity missing a named component", () => {
    const world = new World<GameEntity>();
    const e = world.spawn({ inbox: { messages: [] } });
    expect(findById(world, e.id as number, "inbox", "inventory")).toBeUndefined();
  });

  it("returns undefined for an unknown or despawned id", () => {
    const world = new World<GameEntity>();
    const e = world.spawn({ inbox: { messages: [] } });
    world.despawn(e);
    expect(findById(world, e.id as number, "inbox")).toBeUndefined();
    expect(findById(world, 9999)).toBeUndefined();
  });
});
