import { describe, expect, it, beforeEach } from "vitest";
import {
  getOrCreateCoordinator,
  listCoordinators,
  _resetCnpCoordinatorsForTests,
} from "./cnp-registry";

describe("cnp-registry", () => {
  beforeEach(() => {
    _resetCnpCoordinatorsForTests();
  });

  it("returns the same instance for the same farmerId", () => {
    const a = getOrCreateCoordinator(1);
    const b = getOrCreateCoordinator(1);
    expect(a).toBe(b);
  });

  it("returns different instances for different farmerIds", () => {
    const a = getOrCreateCoordinator(1);
    const b = getOrCreateCoordinator(2);
    expect(a).not.toBe(b);
  });

  it("listCoordinators reflects subsequent getOrCreateCoordinator calls (live view)", () => {
    const live = listCoordinators();
    expect(live.size).toBe(0);

    getOrCreateCoordinator(10);
    expect(live.size).toBe(1);

    getOrCreateCoordinator(20);
    expect(live.size).toBe(2);
  });

  it("_resetCnpCoordinatorsForTests clears all coordinators", () => {
    getOrCreateCoordinator(1);
    getOrCreateCoordinator(2);
    _resetCnpCoordinatorsForTests();
    expect(listCoordinators().size).toBe(0);
  });
});
