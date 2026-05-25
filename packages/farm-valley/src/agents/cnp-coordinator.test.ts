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

  it("acceptProposal records valid bids", () => {
    const coord = new CnpCoordinator();
    start(coord);
    expect(coord.acceptProposal("t1", { bidderId: 2, pricePerUnit: 7, quantity: 3 })).toBe(true);
    expect(coord.acceptProposal("t1", { bidderId: 3, pricePerUnit: 6, quantity: 3 })).toBe(true);
    expect(coord.getTask("t1")!.proposals).toHaveLength(2);
  });

  it("rejects proposals over maxPricePerUnit", () => {
    const coord = new CnpCoordinator();
    start(coord, { maxPricePerUnit: 8 });
    expect(coord.acceptProposal("t1", { bidderId: 2, pricePerUnit: 9, quantity: 3 })).toBe(false);
    expect(coord.getTask("t1")!.proposals).toHaveLength(0);
  });

  it("replaces a bidder's proposal if resubmitted", () => {
    const coord = new CnpCoordinator();
    start(coord);
    coord.acceptProposal("t1", { bidderId: 2, pricePerUnit: 7, quantity: 3 });
    coord.acceptProposal("t1", { bidderId: 2, pricePerUnit: 6, quantity: 3 });
    const task = coord.getTask("t1")!;
    expect(task.proposals).toHaveLength(1);
    expect(task.proposals[0]!.pricePerUnit).toBe(6);
  });

  it("closeTask waits until deadline", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    coord.acceptProposal("t1", { bidderId: 2, pricePerUnit: 7, quantity: 3 });
    expect(coord.closeTask("t1", 4)).toBeNull();
    expect(coord.getTask("t1")!.status).toBe("collecting");
  });

  it("closeTask picks lowest price, tie-broken by lowest bidderId", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    // 3 proposals — bidders 4, 2, 7 with prices 6, 6, 8
    coord.acceptProposal("t1", { bidderId: 4, pricePerUnit: 6, quantity: 3 });
    coord.acceptProposal("t1", { bidderId: 2, pricePerUnit: 6, quantity: 3 });
    coord.acceptProposal("t1", { bidderId: 7, pricePerUnit: 8, quantity: 3 });
    const winner = coord.closeTask("t1", 5);
    expect(winner).toBe(2);
    const task = coord.getTask("t1")!;
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
    coord.acceptProposal("t1", { bidderId: 2, pricePerUnit: 7, quantity: 3 });
    coord.acceptProposal("t1", { bidderId: 3, pricePerUnit: 6, quantity: 3 });
    expect(coord.closeTask("t1", 5)).toBe(3);
    expect(coord.closeTask("t1", 5)).toBe(3);
  });

  it("rejects proposals once a task is no longer collecting", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    coord.acceptProposal("t1", { bidderId: 2, pricePerUnit: 7, quantity: 3 });
    coord.closeTask("t1", 5);
    expect(coord.acceptProposal("t1", { bidderId: 9, pricePerUnit: 6, quantity: 3 })).toBe(false);
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

  it("markCompleted advances task status and pruneFinished drops it", () => {
    const coord = new CnpCoordinator();
    start(coord, { deadlineTick: 5 });
    coord.acceptProposal("t1", { bidderId: 2, pricePerUnit: 7, quantity: 3 });
    coord.closeTask("t1", 5);
    coord.markCompleted("t1");
    expect(coord.getTask("t1")!.status).toBe("completed");
    coord.pruneFinished();
    expect(coord.getTask("t1")).toBeUndefined();
  });
});
