

import type { CropKind } from "../components";

export type CnpTaskStatus = "open" | "collecting" | "awarded" | "completed";

export interface CnpProposal {
  bidderId: number;
  pricePerUnit: number;
  quantity: number;
}

export interface CnpTask {
  taskId: string;
  initiatorId: number;
  buyCrop: CropKind;
  quantity: number;
  maxPricePerUnit: number;
  deadlineTick: number;
  status: CnpTaskStatus;
  proposals: CnpProposal[];
  winnerId: number | null;

  brokenReported?: boolean;
}

export interface StartTaskInput {
  taskId: string;
  initiatorId: number;
  buyCrop: CropKind;
  quantity: number;
  maxPricePerUnit: number;
  deadlineTick: number;
}

export class CnpCoordinator {
  private readonly tasks = new Map<string, CnpTask>();

  startTask(input: StartTaskInput): CnpTask {
    if (this.tasks.has(input.taskId)) {
      throw new Error(`CNP task already exists: ${input.taskId}`);
    }
    const task: CnpTask = {
      taskId: input.taskId,
      initiatorId: input.initiatorId,
      buyCrop: input.buyCrop,
      quantity: input.quantity,
      maxPricePerUnit: input.maxPricePerUnit,
      deadlineTick: input.deadlineTick,
      status: "collecting",
      proposals: [],
      winnerId: null,
    };
    this.tasks.set(input.taskId, task);
    return task;
  }

  closeTask(taskId: string, currentTick: number): number | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    if (task.status !== "collecting") return task.winnerId;
    if (currentTick < task.deadlineTick) return null;

    if (task.proposals.length === 0) {
      task.status = "awarded";
      task.winnerId = null;
      return null;
    }

    let winner = task.proposals[0]!;
    for (let i = 1; i < task.proposals.length; i += 1) {
      const p = task.proposals[i]!;
      if (
        p.pricePerUnit < winner.pricePerUnit ||
        (p.pricePerUnit === winner.pricePerUnit && p.bidderId < winner.bidderId)
      ) {
        winner = p;
      }
    }
    task.status = "awarded";
    task.winnerId = winner.bidderId;
    return winner.bidderId;
  }

  getTask(taskId: string): CnpTask | undefined {
    return this.tasks.get(taskId);
  }

  dueTasks(currentTick: number): readonly CnpTask[] {
    const out: CnpTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status === "collecting" && currentTick >= task.deadlineTick) {
        out.push(task);
      }
    }
    return out;
  }

  findBrokenCommitments(currentTick: number, commitmentWindow: number): readonly CnpTask[] {
    const out: CnpTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status !== "awarded") continue;
      if (task.winnerId === null) continue;
      if (task.brokenReported) continue;
      if (currentTick - task.deadlineTick < commitmentWindow) continue;
      out.push(task);
    }
    return out;
  }

  markBrokenCommitmentReported(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.brokenReported = true;
  }
}
