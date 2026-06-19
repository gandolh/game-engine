/** Tracks keydown/keyup via KeyboardEvent.code (layout-independent). */
export class Keyboard {
  private readonly _pressed = new Set<string>();
  private readonly _justPressed = new Set<string>();
  private readonly _justReleased = new Set<string>();

  private _target: Window | HTMLElement | null = null;

  private readonly _onKeyDown = (e: Event): void => {
    const code = (e as KeyboardEvent).code;
    if (!this._pressed.has(code)) {
      this._pressed.add(code);
      this._justPressed.add(code);
    }
  };

  private readonly _onKeyUp = (e: Event): void => {
    const code = (e as KeyboardEvent).code;
    this._pressed.delete(code);
    this._justReleased.add(code);
  };

  attach(target: Window | HTMLElement): void {
    if (this._target !== null) {
      this.detach();
    }
    this._target = target;
    target.addEventListener("keydown", this._onKeyDown);
    target.addEventListener("keyup", this._onKeyUp);
  }

  detach(): void {
    if (this._target === null) return;
    this._target.removeEventListener("keydown", this._onKeyDown);
    this._target.removeEventListener("keyup", this._onKeyUp);
    this._target = null;
  }

  isDown(code: string): boolean {
    return this._pressed.has(code);
  }

  justPressed(code: string): boolean {
    return this._justPressed.has(code);
  }

  justReleased(code: string): boolean {
    return this._justReleased.has(code);
  }

  endFrame(): void {
    this._justPressed.clear();
    this._justReleased.clear();
  }

  get pressedKeys(): ReadonlySet<string> {
    return this._pressed;
  }
}
