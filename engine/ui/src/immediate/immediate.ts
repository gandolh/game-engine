/**
 * An optional immediate-mode layer over `@engine/ui`'s retained nodes.
 *
 * A screen built on it runs its code every frame and describes the whole screen:
 * `if (ui.button("act.attack", "Atac")) chooseAction("attack")`. Nothing outlives the frame in
 * the SCREEN's code: no node variables, no `setText`, no swapping subtrees in and out of a slot.
 * `@engine/ui` stays retained by default; reach for this on a screen that is mostly dynamic
 * lists, where keeping a tree in step costs more than describing it each frame (corpus
 * decisions.md → *UI — retained by default, immediate mode optional*).
 *
 * Why the nodes are still kept (a keyed cache, not a throwaway tree): the input dispatcher holds
 * node OBJECTS, not ids — the focused node, the pressed node, and the "press and release on the
 * same leaf" activation test. A tree of fresh nodes every frame would break Tab order, hover,
 * pressed state and every click that spans two frames, and the a11y mirror, which diffs by node
 * `id`, would rebuild its DOM every frame. Reusing the node for a key keeps all three working.
 *
 * Keys are unique within one `ImmediateUi` (not scoped by parent), and a node never changes kind
 * under its key. A key not emitted for `evictAfter` consecutive frames (default 60) is evicted:
 * its node is forgotten, a pending click on it is dropped, and if it comes back it gets a fresh
 * node. A key emitted again sooner keeps its node, id, focus and mirror entry.
 *
 * Clicks are delivered one frame late, the usual IMGUI contract: the dispatcher calls the node's
 * `onActivate`, which records the key; the next frame's `button()` call for that key returns true.
 * A click on a button that is not emitted on the next frame is dropped.
 *
 * Measured on MateQuest's combat screen (2026-10-28, corpus mathquest-ui.md): the same tree,
 * mirror and keyboard as the retained screen, a third less tree code, and 6 to 18 times the
 * per-frame refresh (still well under 1% of a frame).
 */
import { box, button, label, panel } from "../widget";
import type { ButtonNode, ContainerNode, LabelNode, UINode } from "../widget";
import type { LayoutProps } from "../layout";

export interface ImmediateLabelOpts {
  readonly color?: string;
  readonly scale?: number;
  readonly maxWidth?: number;
}

export interface ImmediateButtonOpts {
  readonly scale?: number;
  readonly disabled?: boolean;
}

export interface ImmediateUi {
  /**
   * Run one frame: `build` must emit exactly one top-level container. Returns that container
   * (the same object every frame) and whether anything visible or structural changed since the
   * last frame (the host gates its a11y-mirror reconcile on it).
   */
  frame(build: () => void): { root: ContainerNode; changed: boolean };
  panel(key: string, layout: LayoutProps, body?: () => void): ContainerNode;
  box(key: string, layout: LayoutProps, body?: () => void): ContainerNode;
  label(key: string, text: string, opts?: ImmediateLabelOpts): LabelNode;
  /** True on the frame after this button was activated (click, Enter/Space, or the a11y mirror). */
  button(key: string, text: string, opts?: ImmediateButtonOpts): boolean;
  /** The node emitted under `key` (this frame or earlier) — custom draw passes read its `rect`. */
  node(key: string): UINode | undefined;
}

/** Layout props are small flat records (plus a `padding` that may be an object); compare by value. */
function sameLayout(a: LayoutProps, b: LayoutProps): boolean {
  const ak = Object.keys(a) as Array<keyof LayoutProps>;
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) {
    const av = a[k];
    const bv = b[k];
    if (av === bv) continue;
    if (typeof av === "object" && typeof bv === "object" && av !== null && bv !== null) {
      if (JSON.stringify(av) !== JSON.stringify(bv)) return false;
      continue;
    }
    return false;
  }
  return true;
}

function sameChildren(a: readonly UINode[], b: readonly UINode[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface ImmediateUiOptions {
  /** Frames a key may go unemitted before its node is evicted. Default 60. */
  readonly evictAfter?: number;
}

export function createImmediateUi(opts: ImmediateUiOptions = {}): ImmediateUi {
  const evictAfter = Math.max(1, opts.evictAfter ?? 60);
  const cache = new Map<string, UINode>();
  /** The frame each cached key was last emitted in. */
  const lastSeen = new Map<string, number>();
  let frameNo = 0;
  const clicked = new Set<string>();
  /** Child lists being built, innermost last. */
  const stack: UINode[][] = [];
  let top: ContainerNode | null = null;
  let changed = false;
  let first = true;

  function emit(key: string, node: UINode): void {
    lastSeen.set(key, frameNo);
    const parent = stack[stack.length - 1];
    if (parent !== undefined) parent.push(node);
    else if (top === null && (node.kind === "panel" || node.kind === "box")) top = node;
    else throw new Error(`ImmediateUi: "${node.id}" emitted outside the frame's single root`);
  }

  function container(kind: "panel" | "box", key: string, layout: LayoutProps, body?: () => void): ContainerNode {
    let node = cache.get(key) as ContainerNode | undefined;
    if (node === undefined) {
      node = kind === "panel" ? panel(layout, []) : box(layout, []);
      cache.set(key, node);
      changed = true;
    } else if (!sameLayout(node.layout, layout)) {
      node.layout = layout;
      changed = true;
    }
    emit(key, node);
    const kids: UINode[] = [];
    stack.push(kids);
    body?.();
    stack.pop();
    if (!sameChildren(node.children, kids)) {
      node.children = kids;
      changed = true;
    }
    return node;
  }

  return {
    frame(build) {
      changed = first;
      first = false;
      frameNo += 1;
      top = null;
      stack.length = 0;
      build();
      if (top === null) throw new Error("ImmediateUi: the frame emitted no root container");
      // A click recorded for a button that this frame did not emit is stale; drop it.
      clicked.clear();
      for (const [key, seen] of lastSeen) {
        if (frameNo - seen >= evictAfter) {
          lastSeen.delete(key);
          cache.delete(key);
        }
      }
      return { root: top, changed };
    },

    panel: (key, layout, body) => container("panel", key, layout, body),
    box: (key, layout, body) => container("box", key, layout, body),

    label(key, text, opts = {}) {
      let node = cache.get(key) as LabelNode | undefined;
      if (node === undefined) {
        node = label(text, opts);
        cache.set(key, node);
        changed = true;
      } else {
        if (node.text !== text) {
          node.text = text;
          changed = true;
        }
        // Colour and scale are paint-only: a change repaints but needs no mirror reconcile.
        if (opts.color !== undefined) node.color = opts.color;
        if (opts.scale !== undefined && node.scale !== opts.scale) {
          node.scale = opts.scale;
          changed = true;
        }
      }
      emit(key, node);
      return node;
    },

    button(key, text, opts = {}) {
      let node = cache.get(key) as ButtonNode | undefined;
      if (node === undefined) {
        const created = button(text, {
          onActivate: () => clicked.add(key),
          ...(opts.scale !== undefined ? { scale: opts.scale } : {}),
        });
        node = created;
        cache.set(key, node);
        changed = true;
      } else if (node.label !== text) {
        node.label = text;
        changed = true;
      }
      // Only "disabled" is ours to set; hover/active belong to the dispatcher (same rule as the
      // retained screens' `setState`).
      if (opts.disabled === true && node.state !== "disabled") {
        node.state = "disabled";
        changed = true;
      } else if (opts.disabled !== true && node.state === "disabled") {
        node.state = "normal";
        changed = true;
      }
      emit(key, node);
      return clicked.delete(key);
    },

    node: (key) => cache.get(key),
  };
}
