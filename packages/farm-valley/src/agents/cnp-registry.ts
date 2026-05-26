import { CnpCoordinator } from "./cnp-coordinator";

const coordinators = new Map<number, CnpCoordinator>();

export function getOrCreateCoordinator(farmerId: number): CnpCoordinator {
  let c = coordinators.get(farmerId);
  if (!c) {
    c = new CnpCoordinator();
    coordinators.set(farmerId, c);
  }
  return c;
}

/** Read-only view of all coordinators. Stable reference — TrustSystem holds it. */
export function listCoordinators(): ReadonlyMap<number, CnpCoordinator> {
  return coordinators;
}

/** Test helper — clears all coordinator state between cases. */
export function _resetCnpCoordinatorsForTests(): void {
  coordinators.clear();
}
