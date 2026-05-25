import type { InputEvent } from "../runtime/input-log";
import { InputLog } from "../runtime/input-log";

export interface SaveFile {
  version: 1;
  seed: number;
  finalTick: number;
  events: readonly InputEvent[];
}

export function serialize(seed: number, log: InputLog, finalTick: number): SaveFile {
  return {
    version: 1,
    seed,
    finalTick,
    events: log.serialize(),
  };
}

export function deserialize(save: SaveFile): { seed: number; log: InputLog; finalTick: number } {
  if (save.version !== 1) throw new Error(`Unsupported save version: ${save.version}`);
  return {
    seed: save.seed,
    log: InputLog.fromSerialized(save.events),
    finalTick: save.finalTick,
  };
}
