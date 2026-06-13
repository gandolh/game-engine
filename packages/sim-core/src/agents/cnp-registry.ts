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

export function listCoordinators(): ReadonlyMap<number, CnpCoordinator> {
  return coordinators;
}

export function _resetCnpCoordinatorsForTests(): void {
  coordinators.clear();
}
