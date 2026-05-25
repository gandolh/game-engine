// CNP coordinator — pure data + functions for Contract Net Protocol state machines.
// Used by the Hoarder personality (initiator). No system loop here; the personality
// calls into these functions from its deliberate step.
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

  /**
   * Record an incoming PROPOSE message body for `taskId`. Returns true if accepted.
   * Proposals over `maxPricePerUnit` are rejected, as are proposals for unknown tasks
   * or tasks already past the collecting stage.
   */
  acceptProposal(taskId: string, proposal: CnpProposal): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status !== "collecting") return false;
    if (proposal.pricePerUnit > task.maxPricePerUnit) return false;
    // Idempotency: replace if same bidder submits again.
    const existingIdx = task.proposals.findIndex((p) => p.bidderId === proposal.bidderId);
    if (existingIdx >= 0) {
      task.proposals[existingIdx] = { ...proposal };
    } else {
      task.proposals.push({ ...proposal });
    }
    return true;
  }

  /**
   * Close a task after its deadline. Returns the winning bidderId (or null if no
   * proposals). Deterministic: lowest pricePerUnit, tie-broken by lowest bidderId.
   * No-op if the task is already past the collecting stage.
   */
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

  markCompleted(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.status = "completed";
  }

  getTask(taskId: string): CnpTask | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(): readonly CnpTask[] {
    return Array.from(this.tasks.values());
  }

  /** Tasks that have reached their deadline and are still collecting. */
  dueTasks(currentTick: number): readonly CnpTask[] {
    const out: CnpTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status === "collecting" && currentTick >= task.deadlineTick) {
        out.push(task);
      }
    }
    return out;
  }

  /** Drop awarded/completed tasks older than `currentTick` to keep memory bounded. */
  pruneFinished(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === "completed") this.tasks.delete(id);
    }
  }
}
