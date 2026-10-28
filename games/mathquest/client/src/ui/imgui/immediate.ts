/**
 * RESEARCH PROTOTYPE (spec 2026-10-27-mathquest-immediate-mode-research, built 2026-10-28).
 * MateQuest uses it only under the `?imgui` URL flag; the default path is the retained screens.
 *
 * An immediate-mode API over `@engine/ui`'s retained nodes. The screen's code runs every frame and
 * describes the whole screen — `if (ui.button("act.attack", "Atac")) chooseAction("attack")` — and
 * nothing outlives the frame in the SCREEN's code: no node variables, no `setText`, no swapping
 * subtrees in and out of a slot, no `firstRefresh`.
 *
 * Why the nodes are still kept (a keyed cache, not a throwaway tree): `@engine/ui`'s input
 * dispatcher holds node OBJECTS, not ids — `focusedNode`, the pressed node, and the "press and
 * release on the same leaf" activation test (`releasedLeaf === startedOn`). A tree of fresh nodes
 * every frame would break Tab order, hover, pressed state and every click that spans two frames.
 * The a11y mirror diffs by node `id`, so fresh ids would also rebuild its DOM every frame. Reusing
 * the node object for a key keeps all three working with no engine change. That is the cheapest
 * IMGUI this toolkit allows; a truly throwaway tree needs a dispatcher that tracks ids instead.
 *
 * Keys are unique within one `ImmediateUi` (not scoped by parent), and a node never changes kind
 * under its key. Entries are never evicted: a screen has a fixed, small key space (combat uses
 * ~60), so keeping a hidden node means it comes back with its id, focus and mirror entry intact,
 * the same as the retained screens' build-once subtrees. A general engine version would evict
 * keys unseen for some frames.
 *
 * Clicks are delivered one frame late, the usual IMGUI contract: the dispatcher calls the node's
 * `onActivate`, which records the key; the next frame's `button()` call for that key returns true.
 * A click on a button that is not emitted on the next frame is dropped.
 *
 * Imports only `@engine/ui`'s public surface, so it could move into `@engine/ui` unchanged.
 */
import { box, button, label, panel } from "@engine/ui";
import type { ButtonNode, ContainerNode, LabelNode, LayoutProps, UINode } from "@engine/ui";

export interface LabelOpts {
  readonly color?: string;
  readonly scale?: number;
  readonly maxWidth?: number;
}

export interface ButtonOpts {
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
  label(key: string, text: string, opts?: LabelOpts): LabelNode;
  /** True on the frame after this button was activated (click, Enter/Space, or the a11y mirror). */
  button(key: string, text: string, opts?: ButtonOpts): boolean;
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

export function createImmediateUi(): ImmediateUi {
  const cache = new Map<string, UINode>();
  const clicked = new Set<string>();
  /** Child lists being built, innermost last. */
  const stack: UINode[][] = [];
  let top: ContainerNode | null = null;
  let changed = false;
  let first = true;

  function emit(node: UINode): void {
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
    emit(node);
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
      top = null;
      stack.length = 0;
      build();
      if (top === null) throw new Error("ImmediateUi: the frame emitted no root container");
      // A click recorded for a button that this frame did not emit is stale; drop it.
      clicked.clear();
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
      emit(node);
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
      emit(node);
      return clicked.delete(key);
    },

    node: (key) => cache.get(key),
  };
}
