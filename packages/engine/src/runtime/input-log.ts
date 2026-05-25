export interface InputEvent<T = unknown> {
  readonly tick: number;
  readonly kind: string;
  readonly payload: T;
}

export class InputLog {
  private readonly events: InputEvent[] = [];
  private cursor = 0;

  record<T>(event: InputEvent<T>): void {
    if (this.events.length > 0 && event.tick < this.events[this.events.length - 1]!.tick) {
      throw new Error("InputLog.record: events must be appended in non-decreasing tick order");
    }
    this.events.push(event);
  }

  drainForTick(tick: number): readonly InputEvent[] {
    const start = this.cursor;
    while (this.cursor < this.events.length && this.events[this.cursor]!.tick <= tick) {
      this.cursor += 1;
    }
    if (start === this.cursor) return EMPTY;
    return this.events.slice(start, this.cursor);
  }

  resetCursor(): void {
    this.cursor = 0;
  }

  get size(): number {
    return this.events.length;
  }

  serialize(): readonly InputEvent[] {
    return this.events.slice();
  }

  static fromSerialized(events: readonly InputEvent[]): InputLog {
    const log = new InputLog();
    for (const ev of events) log.events.push(ev);
    return log;
  }
}

const EMPTY: readonly InputEvent[] = Object.freeze([]);
