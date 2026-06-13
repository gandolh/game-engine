

export interface CreateElOpts {
  text?: string;
  class?: string;
  style?: Partial<CSSStyleDeclaration>;
}

export function createEl<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  opts?: CreateElOpts,
): HTMLElementTagNameMap[T] {
  const el = document.createElement(tag);
  if (opts?.text !== undefined) {
    el.textContent = opts.text;
  }
  if (opts?.class !== undefined) {
    el.className = opts.class;
  }
  if (opts?.style !== undefined) {
    applyStyles(el, opts.style);
  }
  return el;
}

export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) {
    el.textContent = text;
  }
}

export function applyStyles(
  el: HTMLElement,
  styles: Partial<CSSStyleDeclaration>,
): void {
  for (const [key, value] of Object.entries(styles)) {
    if (typeof value === "string") {
      (el.style as unknown as Record<string, string>)[key] = value;
    }
  }
}
