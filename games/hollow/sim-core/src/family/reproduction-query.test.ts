/**
 * audit-56 — reproduction must not depend on a component it never reads.
 *
 * `Ownership` was a vestigial component: `ownerId` was set to the agent's own id at spawn and read
 * by nothing in production (6 hits repo-wide, all writes or type declarations). Dead code would be
 * harmless — but it was also a KEY IN THE REPRODUCTION QUERY, which made it load-bearing for the
 * wrong reason. An agent spawned without it was **silently sterile**: no error, no log line, it
 * simply never appeared in the query. Any new spawn path — a scenario, a persona fixture, a test, a
 * future migration system — could produce a population that quietly stopped breeding.
 *
 * `Ownership` is now deleted (the inheritance and trade features it was a seam for both shipped on
 * `inventory` instead), so the specific trap is gone. These tests close the CLASS: the query may
 * only name components the system actually uses, and every agent a real spawn path produces must
 * satisfy it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { World, createRng } from "@engine/core";
import type { HollowEntity } from "../components";
import { spawnPopulation } from "../population";
import { LineageRegistry } from "../lineage";

const SRC = readFileSync(fileURLToPath(new URL("./reproduction-system.ts", import.meta.url)), "utf8");

/** The component keys the run loop's `world.query(...)` requires. */
function queryKeys(): string[] {
  const at = SRC.indexOf("this.world.query(");
  expect(at, "reproduction-system.ts no longer calls this.world.query(...)").toBeGreaterThan(-1);
  const call = SRC.slice(at, SRC.indexOf(")", at));
  return [...call.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]!);
}

describe("the reproduction query names only components the system reads", () => {
  it("still queries a non-trivial component set (tripwire)", () => {
    expect(queryKeys().length).toBeGreaterThan(3);
  });

  it("every queried component is actually dereferenced somewhere in the file", () => {
    // THE GUARD. A key nobody reads is not documentation — it is a silent eligibility filter, and
    // the failure it produces (agents that never breed) looks like balance, not like a bug.
    const body = SRC.slice(SRC.indexOf("export class"));
    const unread = queryKeys().filter((k) => {
      // `.needs`, `entity.needs`, `e.needs`, destructuring — any real read of the property.
      const used = new RegExp(`\\.${k}\\b`).test(body) || new RegExp(`\\b${k}:`).test(body);
      return !used;
    });
    expect(
      unread,
      unread.length
        ? `\nreproduction-system.ts REQUIRES component(s) it never reads: ${unread.join(", ")}.\n` +
            `An agent spawned without one is silently sterile — it just never appears in the query.\n` +
            `Either read it, or drop it from the query.\n`
        : "",
    ).toEqual([]);
  });

  it("does not require `ownership` — the component is gone (audit-56)", () => {
    expect(queryKeys()).not.toContain("ownership");
    expect(SRC).not.toContain("ownerId");
  });
});

describe("every agent a real spawn path produces is reproduction-eligible", () => {
  it("spawnPopulation's agents all satisfy the reproduction query", () => {
    const world = new World<HollowEntity>();
    spawnPopulation(world, createRng(11), { population: 12, lineage: new LineageRegistry() });

    const all = [...world.query("agent")];
    const eligible = [...world.query(...(queryKeys() as ["agent"]))];

    expect(all.length).toBe(12);
    // Not "some are eligible" — ALL of them. A spawn path that produces even one ineligible agent
    // is the silent-sterility bug, just at a smaller scale.
    expect(eligible.length).toBe(all.length);
  });

  it("an agent is NOT silently dropped for lacking a component nobody reads", () => {
    // Spawn a minimal agent carrying exactly the queried components and nothing else. Before
    // audit-56 this would have been excluded for want of `ownership`, with no signal at all.
    const world = new World<HollowEntity>();
    spawnPopulation(world, createRng(3), { population: 1, lineage: new LineageRegistry() });
    const [template] = [...world.query("agent")];
    expect(template).toBeDefined();

    const minimal: Record<string, unknown> = {};
    for (const k of queryKeys()) {
      minimal[k] = (template as unknown as Record<string, unknown>)[k];
    }
    const spawned = world.spawn(minimal as HollowEntity);

    const eligible = [...world.query(...(queryKeys() as ["agent"]))];
    expect(eligible.some((e) => e.id === spawned.id)).toBe(true);
  });
});
