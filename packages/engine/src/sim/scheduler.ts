export interface SimContext {
  readonly tick: number;
}

export interface System {
  readonly name: string;
  run(ctx: SimContext): void;
}

export interface StageEntry {
  readonly stage: string;
  readonly name: string;
}

/** Minimal bus interface the scheduler needs for stage-audit mode. Engine stays game-agnostic. */
export interface AuditBus {
  setStage(stage: string): void;
  endTickAudit(): void;
}

export class Scheduler {
  private readonly systems: System[] = [];
  private readonly stageMap: string[] = [];
  private currentStage = "";

  // Audit-mode state (off by default — zero overhead when disabled).
  private auditBus: AuditBus | null = null;

  /** Tag subsequent add() calls with a stage name. Returns `this` for chaining. */
  stage(name: string): this {
    this.currentStage = name;
    return this;
  }

  add(system: System): this {
    this.systems.push(system);
    this.stageMap.push(this.currentStage);
    return this;
  }

  /** Returns the ordered (stage, system name) list. */
  stages(): ReadonlyArray<StageEntry> {
    return this.systems.map((sys, i) => ({
      stage: this.stageMap[i] ?? "",
      name: sys.name,
    }));
  }

  /**
   * Enable per-tick stage audit. When enabled, the scheduler calls bus.setStage()
   * before each system and bus.endTickAudit() after the last system.
   * Must be called before the first tick() to take effect.
   */
  enableStageAudit(bus: AuditBus): this {
    this.auditBus = bus;
    return this;
  }

  tick(ctx: SimContext): void {
    if (this.auditBus !== null) {
      const bus = this.auditBus;
      for (let i = 0; i < this.systems.length; i++) {
        bus.setStage(this.stageMap[i] ?? "");
        this.systems[i]!.run(ctx);
      }
      bus.endTickAudit();
    } else {
      for (const sys of this.systems) sys.run(ctx);
    }
  }
}
