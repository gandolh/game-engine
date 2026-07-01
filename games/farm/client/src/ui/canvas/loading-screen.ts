/**
 * Farm Valley loading screen — the boot-time "Loading… / Seed 0x… / progress" overlay,
 * rendered IN-CANVAS via `@engine/ui`.
 *
 * Ports the old DOM `screens/loading-screen.ts` (`LoadingScreen` class, still present but no
 * longer mounted by this chunk — a later integration chunk wires the swap) onto the same
 * retained create/refresh pattern as {@link "./world-clock"}: {@link createLoadingScreen} builds
 * the tree ONCE; `refresh(state)` re-textures the seed/progress labels in place each frame.
 *
 * The animated three-dot pulse the DOM version did with a CSS keyframe has no canvas
 * equivalent here (no per-frame animation clock is threaded through this panel) — this port
 * folds it into a single static "· · ·" hint, which preserves the visual motif without adding
 * an animation dependency. The panel is otherwise a 1:1 layout port: title, optional seed line,
 * progress text, dot row — as one column inside a single chrome panel.
 *
 * EDG32-only.
 */
import { EDG } from "@engine/core";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";
import { formatSeed } from "./home-screen";

/** The live values the loading screen displays. Supplied each frame by the host. */
export interface LoadingScreenState {
  /** The run seed, or `undefined` to hide the seed line (matches the DOM version's `opts.seed`). */
  seed?: number;
  /** Progress caption text (e.g. "Spawning farmers…"). Empty string shows nothing. */
  progress: string;
}

/** The retained loading screen: its root node plus refresh(). */
export interface LoadingScreen {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * Re-bind all labels from the latest state. Call once per frame while the screen is visible.
   *
   * Returns `true` when LAYOUT-AFFECTING content changed this call, so the host can gate the
   * expensive `computeLayout` + a11y-mirror reconcile behind it. The first call always returns
   * `true` (initial layout).
   */
  refresh(state: LoadingScreenState): boolean;
}

/**
 * Build the retained loading-screen widget tree. The tree is created once; `refresh` mutates it
 * per frame (no re-allocation). Layout: title / seed line / progress / dot hint, stacked in a
 * single chrome panel column.
 */
export function createLoadingScreen(): LoadingScreen {
  const titleLbl = label("Loading...", { color: EDG.cream, scale: 2 });
  const seedLbl = label("", { color: EDG.steel });
  const progressLbl = label("", { color: EDG.tan });
  const dotsLbl = label("* * *", { color: EDG.tan, muted: true });

  const column = box({ direction: "column", gap: 12, align: "center" }, [
    titleLbl,
    seedLbl,
    progressLbl,
    dotsLbl,
  ]);
  const root = panel({ direction: "column", align: "center", padding: 24 }, [column]);

  let changed = false;
  let firstRefresh = true;

  function setText(lbl: LabelNode, text: string): void {
    if (lbl.text !== text) {
      lbl.text = text;
      changed = true;
    }
  }

  function refresh(state: LoadingScreenState): boolean {
    changed = false;

    setText(seedLbl, state.seed !== undefined ? `Seed ${formatSeed(state.seed)}` : "");
    setText(progressLbl, state.progress);

    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
