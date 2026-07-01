/**
 * Farm Valley fatal-error overlay — "Failed to boot: <message>", rendered IN-CANVAS via
 * `@engine/ui`.
 *
 * Ports the old DOM `main/fatal.ts` (`showFatal(el, err)`, still present but no longer mounted —
 * a later integration chunk wires the swap) onto the same retained create/refresh pattern as
 * {@link "./world-clock"}: {@link createFatalScreen} builds the tree ONCE; `refresh(state)`
 * re-textures the message label in place. Since a fatal error can strike before the sim/renderer
 * is otherwise usable, this panel takes NO actions and depends on nothing but `@engine/ui`.
 *
 * EDG32-only.
 */
import { EDG } from "@engine/core";
import { label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";

/** The live values the fatal screen displays. Supplied once (or updated) by the host. */
export interface FatalScreenState {
  /** The error to display. Mirrors `showFatal`'s `err: unknown` — any thrown value is stringified. */
  error: unknown;
}

/** The retained fatal screen: its root node plus refresh(). */
export interface FatalScreen {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind the message label from the latest state. Call once (or whenever the error changes).
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call, so the host can gate the
   * expensive `computeLayout` + a11y-mirror reconcile behind it. The first call always returns
   * `true` (initial layout).
   */
  refresh(state: FatalScreenState): boolean;
}

/** Stringify a thrown value the same way the old DOM `showFatal` did. */
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the retained fatal-screen widget tree. The tree is created once; `refresh` mutates it
 * (no re-allocation). Layout: a single "Failed to boot: <message>" label in a chrome panel.
 */
export function createFatalScreen(): FatalScreen {
  const messageLbl = label("Failed to boot: ", { color: EDG.red });

  const root = panel({ direction: "column", align: "center", padding: 24 }, [messageLbl]);

  let changed = false;
  let firstRefresh = true;

  function setText(lbl: LabelNode, text: string): void {
    if (lbl.text !== text) {
      lbl.text = text;
      changed = true;
    }
  }

  function refresh(state: FatalScreenState): boolean {
    changed = false;
    setText(messageLbl, `Failed to boot: ${messageOf(state.error)}`);
    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
