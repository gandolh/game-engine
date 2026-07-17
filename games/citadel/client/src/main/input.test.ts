/**
 * Todo 2026-07-16 (citadel-ui-pass-tab-reachability): input.ts's window keydown listener
 * forwarded Tab/Enter to uiDispatcher/inspectDispatcher/buildBarDispatcher/settingsDispatcher
 * but NOT siegeDispatcher — so the collapsible "Status" toggle (status-panel.ts) could be
 * focused/activated by mouse and by the a11y-mirror screen-reader path, but NOT by keyboard
 * alone on the canvas. This test pins the fix: siegeDispatcher is now in the same forwarding
 * chain as the others.
 *
 * input.ts pulls in a large module graph (renderer, sim client, terrain, every canvas UI
 * root…) purely for its OTHER event handlers (pointer/wheel/click), none of which this test
 * exercises. Everything except the keydown chain under test is stubbed out — every other
 * dispatcher is a `stubDispatcher()` that never consumes, so the ONLY thing that can make an
 * assertion below pass is siegeDispatcher's own forwarding. siegeDispatcher itself is NOT
 * faked: it's the real `createInputDispatcher` from `@engine/ui` wired to a real
 * `createStatusPanel()` tree (status-panel.ts's own doc explains it's built to be unit-tested
 * this way, without dragging in sim-client.ts's live WebSocket/Worker — see that file).
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createInputDispatcher } from "@engine/ui";
import type { InputDispatcher, A11yMirror, ConsumeResult } from "@engine/ui";
import { createStatusPanel } from "./status-panel";
import type { PanelId, PanelPrefs } from "./panel-prefs";

// ---------------------------------------------------------------------------
// Fakes shared by every OTHER canvas UI root (uiDispatcher/inspect/buildBar/settings/
// newGame/villager) — always "not consumed", so they never interfere with the assertions
// below. Declared as `function`s (not `const`s) so they're safely referenceable from the
// `vi.mock` factories despite Vitest's hoisting of `vi.mock` calls above these declarations
// (function declarations are hoisted independently of that transform).
// ---------------------------------------------------------------------------
function stubDispatcher(): InputDispatcher {
  return {
    pointerMove: (): ConsumeResult => ({ consumed: false }),
    pointerDown: (): ConsumeResult => ({ consumed: false }),
    pointerUp: (): ConsumeResult => ({ consumed: false }),
    wheel: (): ConsumeResult => ({ consumed: false }),
    key: (): ConsumeResult => ({ consumed: false }),
    focus: (): void => {},
    blur: (): void => {},
    focused: () => null,
    hitTest: () => null,
  };
}

function stubMirror(): A11yMirror {
  return { update: () => {}, setFocus: () => {}, destroy: () => {} };
}

/** Same shape as status-panel.test.ts's fake — an in-memory PanelPrefs with toggle calls recorded. */
function makeFakePrefs(defaults: Partial<Record<PanelId, boolean>> = { status: true }): PanelPrefs & {
  readonly toggleCalls: PanelId[];
} {
  const state = new Map<PanelId, boolean>(Object.entries(defaults) as Array<[PanelId, boolean]>);
  const toggleCalls: PanelId[] = [];
  return {
    toggleCalls,
    isOpen(id) {
      return state.get(id) === true;
    },
    setOpen(id, open) {
      state.set(id, open);
    },
    toggle(id) {
      toggleCalls.push(id);
      const next = !(state.get(id) === true);
      state.set(id, next);
      return next;
    },
  };
}

// Mutable box the "./hud-panels" mock reads through getters, so each test can rebind a FRESH
// real siegeDispatcher (built from a fresh createStatusPanel + fake prefs) without re-importing
// input.ts (its module-level `window.addEventListener` registrations must only happen once).
const refs = vi.hoisted(() => ({
  siegeDispatcher: undefined as InputDispatcher | undefined,
  siegeMirror: undefined as A11yMirror | undefined,
}));

vi.mock("./dom", () => ({
  canvas: document.createElement("canvas"),
  a11yMount: null,
  siegeA11yMount: null,
  inspectA11yMount: null,
  villagerA11yMount: null,
  buildBarA11yMount: null,
  settingsA11yMount: null,
  newGameA11yMount: null,
}));

vi.mock("../render/citadel-renderer", () => ({
  fitCameraToCanvas: vi.fn(),
  clampZoom: vi.fn(),
  eventToDevicePx: vi.fn(() => ({ sx: 0, sy: 0 })),
  screenToWorld: vi.fn(() => ({ worldX: 0, worldY: 0 })),
  transformOf: vi.fn(),
  screenToTile: vi.fn(() => ({ tx: 0, ty: 0 })),
}));

vi.mock("../render/citadel-fx", () => ({
  nearestVillager: vi.fn(() => null),
}));

vi.mock("../render/coverage", () => ({
  COVERAGE_SERVICE: {},
  serviceRadius: vi.fn(() => 0),
  housesInRadius: vi.fn(() => 0),
}));

vi.mock("../ui/minimap", () => ({
  MINIMAP_FACE: 0,
}));

vi.mock("./renderer-state", () => ({
  camera: {},
  iso: {},
  inputReady: false,
}));

vi.mock("./placement-wiring", () => ({
  placementState: { mode: "none", updateCursor: vi.fn() },
}));

vi.mock("./terrain", () => ({ terrain: {} }));

vi.mock("./hud-wiring", () => ({ toasts: { push: vi.fn() } }));

vi.mock("./sim-client", () => ({
  currentBuildings: [],
  currentVillagers: [],
  client: { sendCommand: vi.fn() },
}));

// The dispatcher/mirror under test: real @engine/ui plumbing over a real status-panel.ts tree,
// rebuilt per-test via `refs` (see beforeEach below).
vi.mock("./hud-panels", () => ({
  uiDispatcher: stubDispatcher(),
  a11yMirror: stubMirror(),
  get siegeDispatcher() {
    return refs.siegeDispatcher;
  },
  get siegeMirror() {
    return refs.siegeMirror;
  },
}));

vi.mock("./inspect", () => ({
  inspectDispatcher: stubDispatcher(),
  inspectMirror: stubMirror(),
  inspectOpen: vi.fn(() => false),
  closeInspect: vi.fn(),
  openInspectAtTile: vi.fn(() => false),
}));

vi.mock("./build-controls", () => ({
  villagerPanel: undefined,
  villagerDispatcher: stubDispatcher(),
  buildBarDispatcher: stubDispatcher(),
  buildBarMirror: stubMirror(),
  followId: null,
  setFollowId: vi.fn(),
  clearFollow: vi.fn(),
  updateModeLabel: vi.fn(),
}));

vi.mock("./settings", () => ({
  settingsDispatcher: stubDispatcher(),
  settingsMirror: stubMirror(),
  settingsModal: { isOpen: vi.fn(() => false) },
  closeSettings: vi.fn(),
}));

vi.mock("./new-game", () => ({
  newGameDispatcher: stubDispatcher(),
  newGameMirror: stubMirror(),
  newGameOpen: vi.fn(() => false),
}));

vi.mock("./minimap-wiring", () => ({ minimap: null }));

// Registers input.ts's window/canvas listeners exactly once (module singleton) — the getters in
// the "./hud-panels" mock above mean each keydown event still reads whatever `refs.siegeDispatcher`
// currently points to, so per-test rebinding in beforeEach works without re-importing this module.
//
// Loaded via a dynamic import (not a static top-level `import "./input"`) — with a static import,
// ESM evaluates the whole transitive import graph (module instantiation order) before this test
// file's own hoisted `vi.mock` registrations are guaranteed to have taken effect for every
// importer, and input.ts's REAL "./sim-client" ends up loading (which constructs a live
// `CitadelSimClient`/Worker and throws in jsdom). A dynamic import inside `beforeAll` runs after
// the module is fully evaluated, once all the mocks above are registered.
beforeAll(async () => {
  await import("./input");
});

function dispatchKeydown(key: string, shiftKey = false): KeyboardEvent {
  const evt = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  window.dispatchEvent(evt);
  return evt;
}

describe("input.ts keydown chain — siege/status dispatcher forwarding", () => {
  let prefs: PanelPrefs & { toggleCalls: PanelId[] };
  let panel: ReturnType<typeof createStatusPanel>;
  let siegeMirrorSetFocus: ReturnType<typeof vi.fn<(id: number | null) => void>>;

  beforeEach(() => {
    prefs = makeFakePrefs({ status: true });
    panel = createStatusPanel(prefs);
    refs.siegeDispatcher = createInputDispatcher(() => panel.root);
    siegeMirrorSetFocus = vi.fn<(id: number | null) => void>();
    refs.siegeMirror = { update: vi.fn(), setFocus: siegeMirrorSetFocus, destroy: vi.fn() };
  });

  it("Tab reaches and focuses the Status toggle button via siegeDispatcher", () => {
    const toggleBtn = panel.root.children[0];
    expect(toggleBtn?.kind).toBe("button");
    expect(refs.siegeDispatcher?.focused()).toBeNull(); // nothing focused yet

    const evt = dispatchKeydown("Tab");

    expect(refs.siegeDispatcher?.focused()?.id).toBe(toggleBtn?.id);
    expect(evt.defaultPrevented).toBe(true); // the chain preventDefault'd because siege consumed it
    expect(siegeMirrorSetFocus).toHaveBeenCalledWith(toggleBtn?.id);
  });

  it("Enter activates the focused Status toggle, reaching prefs.toggle('status')", () => {
    dispatchKeydown("Tab"); // focus the toggle first, same as a real Tab/Enter sequence
    expect(prefs.toggleCalls).toEqual([]);

    const evt = dispatchKeydown("Enter");

    expect(prefs.toggleCalls).toEqual(["status"]);
    expect(evt.defaultPrevented).toBe(true);
  });

  it("a key the siege panel does not consume falls through untouched (no false-positive forwarding)", () => {
    const evt = dispatchKeydown("a");
    expect(evt.defaultPrevented).toBe(false);
  });
});
