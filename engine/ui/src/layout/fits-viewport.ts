/**
 * Does a laid-out widget tree actually fit the screen it will be drawn on?
 *
 * `computeLayout`'s `opts.width`/`opts.height` say what box the tree is *arranged into*; they do
 * NOT clamp a subtree that measures larger than that box. The surplus is simply positioned outside
 * the canvas, where it is drawn nowhere and — the part that bites — **cannot be hit-tested by a
 * pointer**. A button laid out at `y = 690` on a 640px-tall canvas is, to a player with a mouse,
 * gone.
 *
 * That is not hypothetical: the 2026-09-20 playtest found it shipped in two games at once —
 * MateQuest's answer keypad put `Trimite` plus all three lifelines below the canvas bottom, and
 * Citadel's resource HUD measured 1500px wide and pushed `Pause`/speed past the right edge. Both
 * games' HUD tests were green, because every one of them asserted the retained *tree* (which
 * buttons exist, what their labels and states are) and none asked **where the tree landed**.
 *
 * So this is the missing assertion, and it lives in the engine because the mistake is not specific
 * to any game: lay a root out at {@link MIN_VIEWPORT} and require every interactive node to be
 * inside it. See corpus `wiki/decisions.md` → *Minimum supported viewport* for why that number is
 * what it is, and note it is a **floor, not a target** — bigger viewports get the extra room, but
 * nothing may *require* more than the floor to be operable.
 */
import type { UINode, Rect } from "../widget/node";

/** A canvas box in CSS px — what `computeLayout` is handed as `{ width, height }`. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * The smallest viewport every in-canvas UI in this repo must remain fully operable in: **1280×640
 * CSS px**. Decided 2026-09-20 — the two smallest laptop panels in real use (1366×768, 1280×800)
 * both clear 1280 wide and leave ~640–660px of viewport once browser chrome is subtracted.
 *
 * Games import this rather than re-declaring a number, so raising the floor is one edit here plus
 * whatever that breaks — which is the point of having it.
 */
export const MIN_VIEWPORT: Viewport = { width: 1280, height: 640 };

/** Which edges a node spills past. */
export type OverflowSide = "left" | "right" | "top" | "bottom";

/** One node that does not fit, with enough detail to name it in a failure message. */
export interface ViewportOverflow {
  readonly kind: UINode["kind"];
  /** The node's accessible name where it has one (button label / label text), else `""`. */
  readonly name: string;
  readonly rect: Rect;
  readonly sides: readonly OverflowSide[];
}

export interface FitsViewportOptions {
  /**
   * Also require every *visible content* leaf (labels and icons) to fit, not just the interactive
   * ones. Off by default: a clipped decorative label is a cosmetic bug, while a clipped button is a
   * player who cannot act. Turn it on for screens whose text is the point — a home screen's
   * controls hint, a teach card's worked step.
   */
  readonly includeContent?: boolean;
  /** Names the surface in the failure message, e.g. `"MateQuest combat (typed problem)"`. */
  readonly what?: string;
}

/** Nodes a player must be able to reach with a pointer. */
const INTERACTIVE: ReadonlySet<UINode["kind"]> = new Set(["button", "slider", "checkbox"]);
/** Nodes that carry visible content but no interaction. */
const CONTENT: ReadonlySet<UINode["kind"]> = new Set(["label", "icon"]);

function nameOf(node: UINode): string {
  if (node.kind === "button") return node.label;
  if (node.kind === "label") return node.text;
  if (node.kind === "icon") return node.icon;
  return "";
}

/**
 * Every node in `root`'s laid-out tree that spills outside `viewport`, in tree order.
 *
 * Zero-area nodes are skipped: a blank label or an unmounted subtree measures `0×0`, cannot be seen
 * and so cannot meaningfully be off-screen. Containers are skipped too — a `box` may legitimately be
 * wider than the canvas while every child inside it fits (a centred row with slack, say); what
 * matters is where the leaves land.
 *
 * `computeLayout` must have run on `root` first, or every rect is `{0,0,0,0}` and this returns
 * nothing.
 */
export function findViewportOverflows(
  root: UINode,
  viewport: Viewport = MIN_VIEWPORT,
  opts: FitsViewportOptions = {},
): ViewportOverflow[] {
  const wanted = opts.includeContent === true ? [INTERACTIVE, CONTENT] : [INTERACTIVE];
  const out: ViewportOverflow[] = [];

  const visit = (node: UINode): void => {
    const r = node.rect;
    const counts = wanted.some((set) => set.has(node.kind));
    if (counts && r.width > 0 && r.height > 0) {
      const sides: OverflowSide[] = [];
      if (r.x < 0) sides.push("left");
      if (r.y < 0) sides.push("top");
      if (r.x + r.width > viewport.width) sides.push("right");
      if (r.y + r.height > viewport.height) sides.push("bottom");
      if (sides.length > 0) out.push({ kind: node.kind, name: nameOf(node), rect: r, sides });
    }
    for (const child of node.children) visit(child);
  };

  visit(root);
  return out;
}

/**
 * Throw unless every interactive node in the laid-out `root` is inside `viewport`.
 *
 * The message names **every** offender with its rect and the edges it crosses, because these bugs
 * come in families — one overflowing container strands a whole row of buttons, and fixing the first
 * one the assertion happens to mention is not fixing the bug.
 */
export function assertFitsViewport(
  root: UINode,
  viewport: Viewport = MIN_VIEWPORT,
  opts: FitsViewportOptions = {},
): void {
  const bad = findViewportOverflows(root, viewport, opts);
  if (bad.length === 0) return;

  const what = opts.what ?? "widget tree";
  const lines = bad.map((o) => {
    const { x, y, width, height } = o.rect;
    const named = o.name.length > 0 ? ` "${o.name}"` : "";
    return `  ${o.kind}${named} at (${Math.round(x)},${Math.round(y)}) ${Math.round(width)}×${Math.round(height)}` +
      ` — off ${o.sides.join(" + ")} (bottom=${Math.round(y + height)}, right=${Math.round(x + width)})`;
  });
  throw new Error(
    `${what}: ${bad.length} node(s) laid out outside a ${viewport.width}×${viewport.height} viewport, ` +
      `so a pointer cannot reach them:\n${lines.join("\n")}`,
  );
}
