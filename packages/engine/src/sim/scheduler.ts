export interface SimContext {
  readonly tick: number;
}

export interface System {
  readonly name: string;
  run(ctx: SimContext): void;
}

export class Scheduler {
  private readonly systems: System[] = [];

  add(system: System): this {
    this.systems.push(system);
    return this;
  }

  tick(ctx: SimContext): void {
    for (const sys of this.systems) sys.run(ctx);
  }
}
