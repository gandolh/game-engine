/**
 * Mouse — tracks pointer events on a canvas element.
 * Position is reported in CSS pixels relative to the canvas.
 */
export class Mouse {
  position: { x: number; y: number } = { x: 0, y: 0 };
  wheel = 0;

  private readonly _buttons = new Set<number>();
  private readonly _justPressed = new Set<number>();
  private readonly _justReleased = new Set<number>();

  private _canvas: HTMLCanvasElement | null = null;

  private readonly _onPointerMove = (e: Event): void => {
    const pe = e as PointerEvent;
    const rect = this._canvas!.getBoundingClientRect();
    this.position = {
      x: pe.clientX - rect.left,
      y: pe.clientY - rect.top,
    };
  };

  private readonly _onPointerDown = (e: Event): void => {
    const pe = e as PointerEvent;
    const btn = pe.button;
    if (!this._buttons.has(btn)) {
      this._buttons.add(btn);
      this._justPressed.add(btn);
    }
  };

  private readonly _onPointerUp = (e: Event): void => {
    const pe = e as PointerEvent;
    const btn = pe.button;
    this._buttons.delete(btn);
    this._justReleased.add(btn);
  };

  private readonly _onWheel = (e: Event): void => {
    this.wheel += (e as WheelEvent).deltaY;
  };

  attach(canvas: HTMLCanvasElement): void {
    if (this._canvas !== null) {
      this.detach();
    }
    this._canvas = canvas;
    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointerup", this._onPointerUp);
    canvas.addEventListener("wheel", this._onWheel);
  }

  detach(): void {
    if (this._canvas === null) return;
    this._canvas.removeEventListener("pointermove", this._onPointerMove);
    this._canvas.removeEventListener("pointerdown", this._onPointerDown);
    this._canvas.removeEventListener("pointerup", this._onPointerUp);
    this._canvas.removeEventListener("wheel", this._onWheel);
    this._canvas = null;
  }

  button(n: number): boolean {
    return this._buttons.has(n);
  }

  justPressed(n: number): boolean {
    return this._justPressed.has(n);
  }

  justReleased(n: number): boolean {
    return this._justReleased.has(n);
  }

  /** Call once per tick after all input queries are done. */
  endFrame(): void {
    this.wheel = 0;
    this._justPressed.clear();
    this._justReleased.clear();
  }

  /** Returns the set of currently pressed button indices (read-only view). */
  get pressedButtons(): ReadonlySet<number> {
    return this._buttons;
  }
}
