import { Keyboard } from "./keyboard";
import { Mouse } from "./mouse";

/** Serializable snapshot of input state for a given tick. */
export interface InputSnapshot {
  pressedKeys: string[];
  mousePosition: { x: number; y: number };
  mouseButtons: number[];
  mouseWheel: number;
}

/**
 * InputManager — single entry point for all input.
 * Pass the canvas; keyboard listens on `window`.
 */
export class InputManager {
  readonly keyboard: Keyboard;
  readonly mouse: Mouse;

  constructor(target: HTMLCanvasElement) {
    this.keyboard = new Keyboard();
    this.mouse = new Mouse();
    this.keyboard.attach(target.ownerDocument.defaultView as Window);
    this.mouse.attach(target);
  }

  /** Call once per tick to advance the just-pressed/released lifecycle. */
  endFrame(): void {
    this.keyboard.endFrame();
    this.mouse.endFrame();
  }

  /**
   * Returns a plain serializable snapshot of the current input state.
   * Intended for recording into an InputLog — do NOT call before endFrame
   * within the same tick if you need just-press info preserved.
   */
  snapshot(): InputSnapshot {
    return {
      pressedKeys: [...this.keyboard.pressedKeys],
      mousePosition: { ...this.mouse.position },
      mouseButtons: [...this.mouse.pressedButtons],
      mouseWheel: this.mouse.wheel,
    };
  }
}
