import { describe, expect, it } from "vitest";
import { CnpCoordinator } from "./cnp-coordinator";

function start(coord: CnpCoordinator, overrides: Partial<{ deadlineTick: number; maxPricePerUnit: number }> = {}) {
  return coord.startTask({
    taskId: "t1",
    initiatorId: 1,
    buyCrop: "radish",
    quantity: 3,
    maxPricePerUnit: overrides.maxPricePerUnit ?? 8,
    deadlineTick: overrides.deadlineTick ?? 5,
  });
}

describe("CnpCoordinator", () => {
  it("startTask creates a collecting task with no proposals", () => {
    const coord = new CnpCoordinator();
    const task = start(coord);
    expect(task.status).toBe("collecting");
    expect(task.proposals).toHaveLength(0);
    expect(task.winnerId).toBeNull();
  });

  it("rejects duplicate taskId", () => {
    const coord = new CnpCoordinator();
    start(coord);
    expect(() => start(coord)).toThrow();
  });

  it("closeTask waits until deadline", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    coord.getTask("t1")!.proposals.push({ bidderId: 2, pricePerUnit: 7, quantity: 3 });
    expect(coord.closeTask("t1", 4)).toBeNull();
    expect(coord.getTask("t1")!.status).toBe("collecting");
  });

  it("closeTask picks lowest price, tie-broken by lowest bidderId", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    const task = coord.getTask("t1")!;
    task.proposals.push({ bidderId: 4, pricePerUnit: 6, quantity: 3 });
    task.proposals.push({ bidderId: 2, pricePerUnit: 6, quantity: 3 });
    task.proposals.push({ bidderId: 7, pricePerUnit: 8, quantity: 3 });
    const winner = coord.closeTask("t1", 5);
    expect(winner).toBe(2);
    expect(task.status).toBe("awarded");
    expect(task.winnerId).toBe(2);
  });

  it("closeTask returns null when no proposals were received", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    expect(coord.closeTask("t1", 5)).toBeNull();
    expect(coord.getTask("t1")!.status).toBe("awarded");
    expect(coord.getTask("t1")!.winnerId).toBeNull();
  });

  it("closeTask is idempotent — second call returns the same winner", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    const task = coord.getTask("t1")!;
    task.proposals.push({ bidderId: 2, pricePerUnit: 7, quantity: 3 });
    task.proposals.push({ bidderId: 3, pricePerUnit: 6, quantity: 3 });
    expect(coord.closeTask("t1", 5)).toBe(3);
    expect(coord.closeTask("t1", 5)).toBe(3);
  });

  it("dueTasks lists only collecting tasks past their deadline", () => {
    const coord = new CnpCoordinator();
    coord.startTask({
      taskId: "a", initiatorId: 1, buyCrop: "radish", quantity: 1, maxPricePerUnit: 8, deadlineTick: 5,
    });
    coord.startTask({
      taskId: "b", initiatorId: 1, buyCrop: "radish", quantity: 1, maxPricePerUnit: 8, deadlineTick: 9,
    });
    const due = coord.dueTasks(5).map((t) => t.taskId);
    expect(due).toEqual(["a"]);
  });

  it("findBrokenCommitments returns awarded tasks past the commitment window", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    const task = coord.getTask("t1")!;
    task.proposals.push({ bidderId: 2, pricePerUnit: 7, quantity: 3 });
    coord.closeTask("t1", 5);

    expect(coord.findBrokenCommitments(8, 4)).toEqual([]);
    const broken = coord.findBrokenCommitments(9, 4);
    expect(broken).toHaveLength(1);
    expect(broken[0]!.taskId).toBe("t1");
  });

  it("markBrokenCommitmentReported prevents re-reporting", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    const task = coord.getTask("t1")!;
    task.proposals.push({ bidderId: 2, pricePerUnit: 7, quantity: 3 });
    coord.closeTask("t1", 5);

    const broken = coord.findBrokenCommitments(10, 4);
    expect(broken).toHaveLength(1);
    coord.markBrokenCommitmentReported("t1");
    expect(coord.findBrokenCommitments(20, 4)).toEqual([]);
  });

  it("findBrokenCommitments excludes tasks with no winner", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    coord.closeTask("t1", 5);

    expect(coord.getTask("t1")!.winnerId).toBeNull();
    expect(coord.findBrokenCommitments(50, 4)).toEqual([]);
  });
});
