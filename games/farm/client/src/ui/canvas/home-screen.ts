/**
 * Farm Valley home screen — title/subtitle + Start/Randomize controls, rendered IN-CANVAS via
 * `@engine/ui`, with the seed field as the ONE documented DOM exception (per
 * `corpus/todos/2026-07-01-farm-ui-all-rendered-in-canvas.md` decision 3 — canvas has no
 * text-input widget; native text entry needs real DOM for IME/paste/caret).
 *
 * Replaces the old DOM `screens/home-screen.ts` (`HomeScreen` class, since deleted) with the
 * retained create/refresh pattern: {@link createHomeScreen} builds the canvas tree ONCE
 * (title/subtitle/hint labels + Start + Randomize buttons) and ALSO creates one hidden-ish
 * `<input>` for the seed, appended to `document.body` (matching where the DOM version's overlay
 * lived). The host positions that input over the canvas panel each frame (it owns the camera/
 * canvas rect) and removes it via {@link HomeScreen.destroy} when the screen dismisses.
 *
 * `formatSeed`/`parseSeed`/`DEFAULT_SEED` are defined here (moved from the old DOM
 * `screens/home-screen.ts`, which this replaces) since the loading-screen and game-over canvas
 * panels both need them for their own seed readouts.
 *
 * EDG32-only for everything canvas-rendered. The DOM seed input itself is minimally styled (no
 * gradients/shadows) since it's the one non-canvas surface — see `SEED_INPUT_STYLE` below.
 */
import { EDG } from "@engine/core";
import { box, button, label, panel } from "@engine/ui";
import type { ContainerNode } from "@engine/ui";

export const DEFAULT_SEED = 0xc0ffee;

export function parseSeed(raw: string, fallback = DEFAULT_SEED): number {
  const s = raw.trim();
  if (s === "") return fallback;
  const n = /^0x[0-9a-fA-F]+$/.test(s) ? Number.parseInt(s, 16) : Number(s);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function formatSeed(seed: number): string {
  return `0x${(seed >>> 0).toString(16)}`;
}

/** Options for {@link createHomeScreen}. Mirrors the old DOM `HomeScreenOptions`. */
export interface HomeScreenOptions {
  title?: string;
  subtitle?: string;
  startLabel?: string;
  defaultSeed?: number;
}

/** Actions the host wires into the panel's controls. */
export interface HomeScreenActions {
  /** Start was triggered (button click, or Enter in the seed field / anywhere on the screen). */
  onStart(seed: number): void;
  /** Randomize was clicked — the panel already wrote the fresh seed into the DOM input. */
  onRandomize?(seed: number): void;
}

/** Minimal inline styling for the ONE DOM exception — the seed text input. No EDG32 gradients/
 * shadows; just enough to read as part of the panel. Colors still come from `EDG.*`. */
function styleSeedInput(el: HTMLInputElement): void {
  el.style.position = "absolute";
  el.style.padding = "6px 10px";
  el.style.fontSize = "14px";
  el.style.fontFamily = "ui-monospace, monospace";
  el.style.color = EDG.cream;
  el.style.background = EDG.ink;
  el.style.border = `1px solid ${EDG.tan}`;
  el.style.borderRadius = "4px";
  el.style.width = "140px";
  el.style.textAlign = "center";
  el.style.zIndex = "1000";
}

/** The retained home screen: its canvas root, refresh(), and the DOM seed-input handle. */
export interface HomeScreen {
  /** The widget tree root — pass to `computeLayout` / `renderTree` / `mirror.update`. */
  readonly root: ContainerNode;
  /**
   * The DOM seed `<input>` — the documented DOM exception. The host is responsible for
   * positioning it (absolute, over the canvas panel's seed row) each frame and for focus
   * management; this module only creates/styles/reads/writes it.
   */
  readonly seedInputEl: HTMLInputElement;
  /** Current parsed seed value from the DOM input (falls back to the configured default). */
  getSeedValue(): number;
  /** Overwrite the DOM input's text (used by the host after a resize/reposition, not required
   * for normal operation — {@link HomeScreenActions.onRandomize} already updates it). */
  setSeedText(text: string): void;
  /**
   * Refresh the canvas labels. This screen's canvas content is static (title/subtitle/hint text
   * never changes post-construction), so this only needs calling once — provided for symmetry
   * with the other panels' create/refresh pattern. Always returns `true` on first call, `false`
   * after (nothing to re-bind).
   */
  refresh(): boolean;
  /** Remove the DOM seed input from the document. Call when the home screen is dismissed. */
  destroy(): void;
}

/**
 * Build the retained home-screen widget tree + the DOM seed input, and wire Start/Randomize to
 * `actions`. The canvas tree is created once; the DOM input is appended to `document.body`.
 */
export function createHomeScreen(actions: HomeScreenActions, opts: HomeScreenOptions = {}): HomeScreen {
  const defaultSeed = opts.defaultSeed ?? DEFAULT_SEED;

  const titleLbl = label(opts.title ?? "Farm Valley", { color: EDG.cream, scale: 3 });
  const subtitleLbl = label(
    opts.subtitle ??
      "Play as Pip and farm alongside four BDI rivals - plant, trade, and outwit them across 100 days. WASD/arrows to move, E to act, Space to recenter on yourself.",
    { color: EDG.steel },
  );

  const seedLabelLbl = label("Seed", { color: EDG.steel });

  const seedInputEl = document.createElement("input");
  seedInputEl.type = "text";
  seedInputEl.spellcheck = false;
  seedInputEl.value = formatSeed(defaultSeed);
  seedInputEl.setAttribute("aria-label", "Run seed");
  styleSeedInput(seedInputEl);
  document.body.appendChild(seedInputEl);

  function currentSeed(): number {
    return parseSeed(seedInputEl.value, defaultSeed);
  }

  seedInputEl.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      actions.onStart(currentSeed());
    }
  });

  const randomizeBtn = button("Randomize", {
    onActivate: () => {
      const fresh = Math.floor(Math.random() * 0x100000000) >>> 0;
      seedInputEl.value = formatSeed(fresh);
      actions.onRandomize?.(fresh);
    },
  });

  const seedRow = box({ direction: "row", gap: 10, align: "center" }, [seedLabelLbl, randomizeBtn]);

  const startBtn = button(opts.startLabel ?? "Start", {
    onActivate: () => actions.onStart(currentSeed()),
  });

  const hintLbl = label("Press Enter or click Start", { color: EDG.steel });

  const column = box({ direction: "column", gap: 16, align: "center" }, [
    titleLbl,
    subtitleLbl,
    seedRow,
    startBtn,
    hintLbl,
  ]);
  const root = panel({ direction: "column", align: "center", padding: 24 }, [column]);

  let firstRefresh = true;
  function refresh(): boolean {
    const result = firstRefresh;
    firstRefresh = false;
    return result;
  }

  function destroy(): void {
    seedInputEl.remove();
  }

  return {
    root,
    seedInputEl,
    getSeedValue: currentSeed,
    setSeedText: (text: string) => {
      seedInputEl.value = text;
    },
    refresh,
    destroy,
  };
}
