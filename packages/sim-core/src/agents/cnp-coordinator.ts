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
  /** True once the trust system has emitted a broken-commitment delta for this task. */
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

  getTask(taskId: string): CnpTask | undefined {
    return this.tasks.get(taskId);
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

  /**
   * Tasks whose winners were ACCEPTed at the deadline but never marked as
   * completed within `commitmentWindow` ticks of the deadline. Treated as
   * broken commitments by the trust system.
   *
   * Excludes:
   *   - tasks with `winnerId === null` (no winner picked, nothing to break)
   *   - tasks already in `completed` status (delivery happened)
   *   - tasks already reported via `markBrokenCommitmentReported`
   */
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

  /** Mark a task as having had its broken-commitment trust delta applied. */
  markBrokenCommitmentReported(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.brokenReported = true;
  }
}
