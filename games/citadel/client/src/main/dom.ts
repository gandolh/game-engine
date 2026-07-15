/**
 * Citadel main/ split (brief 114): every `document.getElementById` lookup the entry point
 * needs, gathered in one place. Moved verbatim out of main.ts — same ids, same (lack of)
 * null-guards on the `!`-asserted ones (save/load buttons, the canvas, the settings button
 * are all guaranteed present by index.html).
 */
export const canvas = document.getElementById("canvas") as HTMLCanvasElement;

// Phase 5: save/load UI
export const btnSave = document.getElementById("btn-save")!;
export const btnLoad = document.getElementById("btn-load")!;
export const loadFileInput = document.getElementById("load-file-input")! as HTMLInputElement;

// Event toasts (top-center) render IN-CANVAS via @engine/ui; #toast-live is the hidden
// aria-live a11y mirror ToastManager writes into.
export const toastLiveEl = document.getElementById("toast-live");

// Hidden a11y mirror mounts — one per in-canvas UI root, each a distinct DOM subtree so
// screen-reader Tab order matches the visual layering.
export const a11yMount = document.getElementById("ui-a11y-mirror");
export const siegeA11yMount = document.getElementById("ui-a11y-siege");
export const inspectA11yMount = document.getElementById("ui-a11y-inspect");
export const villagerA11yMount = document.getElementById("ui-a11y-villager");
export const buildBarA11yMount = document.getElementById("ui-a11y-buildbar");
export const settingsA11yMount = document.getElementById("ui-a11y-settings");
export const newGameA11yMount = document.getElementById("ui-a11y-newgame");

export const btnSettings = document.getElementById("btn-settings")!;
