/**
 * CommandSystem — drains the CommandQueue at a fixed point each tick
 * (early, before world-mutating gameplay systems) and dispatches each
 * command to its registered handler.
 *
 * The engine provides the dispatch machinery; the game registers concrete
 * handlers. No game-specific logic lives here.
 */
import type { System, SimContext } from "../sim/scheduler";
import type { Command, CommandQueue } from "./command-queue";

export type CommandHandler<C extends Command = Command> = (
  cmd: C,
  ctx: SimContext,
) => void;

export class CommandSystem<C extends Command = Command> implements System {
  readonly name = "CommandSystem";

  private readonly handlers = new Map<string, CommandHandler<Command>>();

  constructor(private readonly queue: CommandQueue<C>) {}

  /**
   * Register a handler for a specific command type.
   * Only one handler per type; calling again replaces the previous one.
   */
  register<T extends C["type"]>(
    type: T,
    handler: CommandHandler<Extract<C, { type: T }>>,
  ): this {
    // Cast: handler is compatible at runtime because we only call it
    // when cmd.type === type.
    this.handlers.set(type, handler as CommandHandler<Command>);
    return this;
  }

  run(ctx: SimContext): void {
    const batch = this.queue.drain();
    for (const cmd of batch) {
      const handler = this.handlers.get(cmd.type);
      if (handler !== undefined) {
        handler(cmd, ctx);
      }
    }
  }
}
