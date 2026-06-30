import type { ButtonNode, ContainerNode, LabelNode, UINode } from "../widget/node";
import { isContainer } from "../widget/node";

/**
 * `@engine/ui` — the hidden DOM **accessibility mirror** (Chunk 5).
 *
 * The framework renders **100% in-canvas**: a sighted pointer user operates the picture the
 * renderer draws. That picture is invisible to a screen reader and unreachable by the keyboard,
 * so this module maintains a **parallel, invisible DOM subtree** that structurally mirrors the
 * retained widget tree (Chunk 3) and exposes it to assistive tech + the Tab order. Both surfaces
 * drive the **same** commands: a mirror `<button>` invokes the exact same
 * {@link ButtonNode.onActivate} the canvas click path uses — one command path, not two.
 *
 * ## Node → DOM mapping
 *
 * | widget node            | DOM element | accessible role / name                                  |
 * | ---------------------- | ----------- | ------------------------------------------------------- |
 * | `ButtonNode`           | `<button>`  | name = the button's `label`; `disabled` when state is   |
 * |                        |             | `"disabled"`; `aria-pressed="true"` while `"active"`    |
 * | `ContainerNode` with a | `<section>` | `role="region"`, `aria-label` = its first child label's |
 * |   leading `LabelNode`  |             | text (a labelled landmark)                              |
 * | `ContainerNode` (other)| `<div>`     | `role="group"`                                          |
 * | `LabelNode`            | `<p>`       | its `text` as the text content                          |
 *
 * Only *meaningful* nodes get an element. A `ContainerNode`'s leading `LabelNode` is consumed as
 * the region's `aria-label` (so the heading isn't also announced as a separate paragraph); every
 * other label maps to a `<p>`. Bare layout `box`es with no heading still map to a `role="group"`
 * so the DOM nesting matches the visual nesting (and screen-reader users hear the structure).
 *
 * ## Sync
 *
 * {@link A11yMirror.update} is idempotent: call it per frame or on tree change. It reconciles the
 * existing DOM against the tree, keyed by each node's stable `id` — creating, removing, and
 * **reordering** elements in **tree (pre-order) order** so DOM tab order == visual order, and
 * patching only the attributes that changed (label text, `disabled`, `aria-pressed`). It does not
 * tear the subtree down and rebuild it.
 *
 * ## Focus bridge
 *
 * The mirror and the Chunk-4 input dispatcher each own one side of "what's focused". They are
 * connected by the **host** through two explicit hooks, so this module never imports the
 * dispatcher:
 *
 *  - **DOM → framework:** when a mirror `<button>` takes DOM focus (Tab / AT), the mirror calls
 *    {@link A11yMirrorOptions.onFocusNode} with the node id (or `null` on blur out of the mirror).
 *    The host forwards that to `dispatcher.focus(id)` so the canvas paints the focused state.
 *  - **framework → DOM:** when framework focus changes programmatically, the host calls
 *    {@link A11yMirror.setFocus} with the id; the mirror moves native DOM focus to that element.
 *
 * To avoid a feedback loop (`setFocus` → element `focus` event → `onFocusNode` → host →
 * `setFocus` …), `onFocusNode` is suppressed while the mirror is itself moving focus.
 */

/** Options for {@link createA11yMirror}. */
export interface A11yMirrorOptions {
  /**
   * Called when DOM focus enters a mirror button (with its node `id`) or leaves the mirror
   * entirely (`null`). The host forwards this to the input dispatcher's `focus`/`blur` so the
   * canvas reflects keyboard/AT focus. Not called for focus moves the mirror itself initiates via
   * {@link A11yMirror.setFocus} (those already originate from the framework).
   */
  onFocusNode?: (id: number | null) => void;
  /**
   * Accessible label for the mirror's root landmark (`<nav>`-less `role="region"`). Defaults to
   * `"User interface"`. Off-palette concerns don't apply — this is text, not colour.
   */
  rootLabel?: string;
}

/** The mirror controller returned by {@link createA11yMirror}. */
export interface A11yMirror {
  /**
   * Reconcile the hidden DOM against `root` (or clear it when `null`). Idempotent; safe to call
   * every frame. Diffs by node `id`, touching only changed elements, in tree order.
   */
  update(root: UINode | null): void;
  /**
   * Move native DOM focus to the mirror element for `id` (or blur the mirror on `null`). Used by
   * the host to mirror programmatic framework focus changes. Does not invoke `onFocusNode`.
   */
  setFocus(id: number | null): void;
  /** Remove all mirror DOM and detach listeners. The `mount` element itself is left in place. */
  destroy(): void;
}

/** One reconciled entry: the node's element + the activation listener bound to its current node. */
interface Entry {
  el: HTMLElement;
  /** The button click listener, kept so we can rebind it when the node identity is replaced. */
  onClick?: (e: Event) => void;
  /** The node whose `onActivate` the bound listener calls — tracked to detect identity swaps. */
  node?: ButtonNode;
}

/**
 * The visually-hidden, AT-visible style ("sr-only"). Clip the element to a 1px box and pull it
 * out of flow **without** `display:none` or `visibility:hidden` (both of which would also remove
 * it from the accessibility tree and the tab order). The element stays focusable and announced.
 *
 * No colours here, so the EDG32 guard is satisfied; this is pure geometry/overflow.
 */
const SR_ONLY: Partial<CSSStyleDeclaration> = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: "0",
  border: "0",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

function applySrOnly(el: HTMLElement): void {
  for (const [k, v] of Object.entries(SR_ONLY)) {
    // Index-assign each known sr-only property; values are all strings above.
    (el.style as unknown as Record<string, string>)[k] = v as string;
  }
}

/** Is this container's first child a label we should hoist into an `aria-label`? */
function leadingLabel(node: ContainerNode): LabelNode | null {
  const first = node.children[0];
  return first && first.kind === "label" ? first : null;
}

/**
 * Create a DOM accessibility mirror mounted under `mount` (a host-supplied container already in
 * the document). See the module doc for the node→DOM mapping and the focus-bridge contract.
 */
export function createA11yMirror(mount: HTMLElement, opts: A11yMirrorOptions = {}): A11yMirror {
  const doc = mount.ownerDocument;
  const onFocusNode = opts.onFocusNode;

  // The root landmark all mirror elements live under. Visually hidden, AT-visible.
  const rootEl = doc.createElement("section");
  rootEl.setAttribute("role", "region");
  rootEl.setAttribute("aria-label", opts.rootLabel ?? "User interface");
  applySrOnly(rootEl);
  mount.appendChild(rootEl);

  // id → reconciled entry. Survives across `update` calls; that's what makes diffing cheap.
  const entries = new Map<number, Entry>();

  // True while we are programmatically moving focus, to suppress the resulting `focus` event from
  // being reported back out (it didn't originate from the user/AT).
  let suppressFocusOut = false;

  function makeElement(node: UINode): Entry {
    if (node.kind === "button") {
      const el = doc.createElement("button");
      el.type = "button";
      const entry: Entry = { el };
      bindButton(entry, node);
      return entry;
    }
    if (node.kind === "label") {
      const el = doc.createElement("p");
      return { el };
    }
    // Container: labelled region if it has a leading heading label, else a plain group.
    const head = leadingLabel(node);
    if (head) {
      const el = doc.createElement("section");
      el.setAttribute("role", "region");
      return { el };
    }
    const el = doc.createElement("div");
    el.setAttribute("role", "group");
    return { el };
  }

  function bindButton(entry: Entry, node: ButtonNode): void {
    const btn = entry.el as HTMLButtonElement;
    // Rebind if this element is now backing a different node instance (id reuse is impossible —
    // ids are process-unique — but defensive against an entry being repurposed).
    if (entry.node === node && entry.onClick) return;
    if (entry.onClick) btn.removeEventListener("click", entry.onClick);
    const onClick = (): void => {
      // Same command path as the canvas: invoke the node's own handle. The native <button> won't
      // fire `click` while `disabled`, so disabled buttons are inoperable for free; we also guard
      // on state in case a host enables the element another way.
      if (node.state === "disabled") return;
      node.onActivate?.();
    };
    btn.addEventListener("click", onClick);
    entry.onClick = onClick;
    entry.node = node;
  }

  function patchButton(entry: Entry, node: ButtonNode): void {
    bindButton(entry, node);
    const btn = entry.el as HTMLButtonElement;
    if (btn.textContent !== node.label) btn.textContent = node.label;
    const disabled = node.state === "disabled";
    if (btn.disabled !== disabled) btn.disabled = disabled;
    // `aria-pressed` is only meaningful while the button is held active; clear it otherwise so it
    // doesn't read as a permanently-toggled control.
    if (node.state === "active") btn.setAttribute("aria-pressed", "true");
    else btn.removeAttribute("aria-pressed");
  }

  function patchLabel(entry: Entry, node: LabelNode): void {
    if (entry.el.textContent !== node.text) entry.el.textContent = node.text;
  }

  function patchRegion(entry: Entry, node: ContainerNode): void {
    const head = leadingLabel(node);
    const name = head ? head.text : "";
    if (entry.el.getAttribute("aria-label") !== name) entry.el.setAttribute("aria-label", name);
  }

  function onFocusIn(e: FocusEvent): void {
    if (suppressFocusOut) return;
    const target = e.target as HTMLElement | null;
    const id = target ? idForElement(target) : null;
    onFocusNode?.(id);
  }

  function onFocusOut(e: FocusEvent): void {
    if (suppressFocusOut) return;
    // Focus left the mirror entirely (relatedTarget outside rootEl) → report null.
    const next = e.relatedTarget as Node | null;
    if (next && rootEl.contains(next)) return;
    onFocusNode?.(null);
  }

  function idForElement(el: HTMLElement): number | null {
    const raw = el.dataset["uiId"];
    return raw === undefined ? null : Number(raw);
  }

  // Focus events bubble (focusin/focusout), so one pair of listeners on the root covers all
  // descendant buttons regardless of reconciliation.
  rootEl.addEventListener("focusin", onFocusIn);
  rootEl.addEventListener("focusout", onFocusOut);

  /**
   * Reconcile the desired flat, ordered list of (node, depth, parentEl) against the live DOM.
   * We compute the desired sequence in pre-order, then place each element under its mapped parent
   * in order, creating/moving as needed, and finally drop any entry whose id is no longer present.
   */
  function update(root: UINode | null): void {
    const seen = new Set<number>();
    // For each node, the DOM element its *children* should be appended under. A consumed leading
    // label has no element of its own, so it doesn't appear in the walk.
    if (root) reconcile(root, rootEl, seen);

    // Remove entries for nodes that vanished from the tree.
    for (const [id, entry] of entries) {
      if (seen.has(id)) continue;
      if (entry.onClick) entry.el.removeEventListener("click", entry.onClick);
      entry.el.remove();
      entries.delete(id);
    }
  }

  /**
   * Place `node`'s element under `parentEl` (in order via `appendChild`, which moves an existing
   * child to the end — giving us correct tree order across reorders), then recurse. The leading
   * heading label of a region is skipped as a standalone element (it becomes the aria-label).
   */
  function reconcile(node: UINode, parentEl: HTMLElement, seen: Set<number>): void {
    let entry = entries.get(node.id);
    if (!entry) {
      entry = makeElement(node);
      entry.el.dataset["uiId"] = String(node.id);
      entries.set(node.id, entry);
    }
    seen.add(node.id);

    // Patch the node's own attributes.
    if (node.kind === "button") patchButton(entry, node);
    else if (node.kind === "label") patchLabel(entry, node);
    else patchRegion(entry, node);

    // Append (or move) to the correct ordinal position under the parent.
    parentEl.appendChild(entry.el);

    if (isContainer(node)) {
      const head = leadingLabel(node);
      for (const child of node.children) {
        if (child === head) continue; // consumed as the region's aria-label
        reconcile(child, entry.el, seen);
      }
    }
  }

  function setFocus(id: number | null): void {
    suppressFocusOut = true;
    try {
      if (id === null) {
        const active = doc.activeElement as HTMLElement | null;
        if (active && rootEl.contains(active)) active.blur();
        return;
      }
      const entry = entries.get(id);
      entry?.el.focus();
    } finally {
      suppressFocusOut = false;
    }
  }

  function destroy(): void {
    rootEl.removeEventListener("focusin", onFocusIn);
    rootEl.removeEventListener("focusout", onFocusOut);
    for (const entry of entries.values()) {
      if (entry.onClick) entry.el.removeEventListener("click", entry.onClick);
    }
    entries.clear();
    rootEl.remove();
  }

  return { update, setFocus, destroy };
}
