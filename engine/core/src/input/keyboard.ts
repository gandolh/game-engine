/** Tracks keydown/keyup via KeyboardEvent.code (layout-independent). */
export class Keyboard {
  private readonly _pressed = new Set<string>();
  private readonly _justPressed = new Set<string>();
  private readonly _justReleased = new Set<string>();

  private _target: Window | HTMLElement | null = null;
  /** Teardown thunks for the focus-loss listeners, which are NOT bound to `_target`. */
  private _focusLossTeardown: Array<() => void> = [];

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

  /**
   * Release every held key, as if a `keyup` had arrived for each.
   *
   * The OS delivers the real `keyup` to whichever window has focus, so a key held across an
   * Alt-Tab, a devtools click or a tab switch NEVER releases here: `_pressed` keeps it forever and
   * the consumer keeps acting on it (Farm drove Pip into the map edge this way for as long as the
   * player was away). Pushing each code into `_justReleased` matters as much as clearing
   * `_pressed` — a consumer polling edge transitions must see a clean release rather than a key
   * that silently vanished between frames.
   */
  private readonly _onFocusLoss = (): void => {
    for (const code of this._pressed) this._justReleased.add(code);
    this._pressed.clear();
  };

  private readonly _onVisibilityChange = (e: Event): void => {
    const doc = (e.target ?? null) as Document | null;
    // Only a hide is a focus loss; the matching `visible` event must not clear anything.
    if (doc === null || doc.hidden) this._onFocusLoss();
  };

  attach(target: Window | HTMLElement): void {
    if (this._target !== null) {
      this.detach();
    }
    this._target = target;
    target.addEventListener("keydown", this._onKeyDown);
    target.addEventListener("keyup", this._onKeyUp);

    // ASYMMETRY, ON PURPOSE: key events are read from `target` (which may be an element), but
    // focus loss is a WINDOW concern — an element never receives `blur` for an Alt-Tab. So the
    // reset listeners go on the window that owns `target`, not on `target` itself. Resolved from
    // the target rather than a global `window` so a second document (jsdom in tests, an iframe or
    // popout in a browser) stays self-consistent.
    const win = this._ownerWindow(target);
    if (win === null) return;

    const add = (
      host: EventTarget | null | undefined,
      type: string,
      fn: EventListener,
    ): void => {
      if (!host) return;
      host.addEventListener(type, fn);
      this._focusLossTeardown.push(() => { host.removeEventListener(type, fn); });
    };

    add(win, "blur", this._onFocusLoss);          // Alt-Tab, devtools, another monitor
    add(win, "pagehide", this._onFocusLoss);      // mobile backgrounding / bfcache
    add(win.document, "visibilitychange", this._onVisibilityChange); // tab switch
  }

  detach(): void {
    if (this._target === null) return;
    this._target.removeEventListener("keydown", this._onKeyDown);
    this._target.removeEventListener("keyup", this._onKeyUp);
    this._target = null;
    for (const undo of this._focusLossTeardown) undo();
    this._focusLossTeardown = [];
  }

  /** Test seam: how many listeners `attach` is currently holding open. */
  get listenerCount(): number {
    return this._target === null ? 0 : 2 + this._focusLossTeardown.length;
  }

  private _ownerWindow(target: Window | HTMLElement): (Window & typeof globalThis) | null {
    // A `Window` has itself as `.window`; an element resolves via its document.
    const asWin = target as Partial<Window>;
    if (typeof asWin.addEventListener === "function" && asWin.window === target) {
      return target as Window & typeof globalThis;
    }
    const doc = (target as HTMLElement).ownerDocument ?? null;
    return (doc?.defaultView ?? null) as (Window & typeof globalThis) | null;
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
