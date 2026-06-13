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

export interface AuditBus {
  setStage(stage: string): void;
  endTickAudit(): void;
}

export class Scheduler {
  private readonly systems: System[] = [];
  private readonly stageMap: string[] = [];
  private currentStage = "";

  private auditBus: AuditBus | null = null;

  stage(name: string): this {
    this.currentStage = name;
    return this;
  }

  add(system: System): this {
    this.systems.push(system);
    this.stageMap.push(this.currentStage);
    return this;
  }

  stages(): ReadonlyArray<StageEntry> {
    return this.systems.map((sys, i) => ({
      stage: this.stageMap[i] ?? "",
      name: sys.name,
    }));
  }

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
