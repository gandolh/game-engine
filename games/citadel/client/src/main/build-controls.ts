import {
  getBuildingDef,
  getProductionDef,
  tierAtLeast,
  BUILDING_MAX_LEVEL,
  upgradeCost,
} from "@citadel/sim-core";
import type { BuildingSnapshot, SettlementTier } from "@citadel/sim-core";
import { createInputDispatcher, createA11yMirror } from "@engine/ui";
import type { InputDispatcher, A11yMirror } from "@engine/ui";
import { createVillagerPanel } from "../ui/villager-panel";
import type { VillagerPanel } from "../ui/villager-panel";
import { createBuildBar } from "../ui/build-bar";
import type { BuildBar, BuildTool } from "../ui/build-bar";
import { villagerA11yMount, buildBarA11yMount } from "./dom";
import { placementState } from "./placement-wiring";
import { currentBuildings, peakTier } from "./sim-client";

// Villager-job chunk 3: a FOURTH in-canvas UI root — the floating follow-a-villager panel.
// It shares the same `uiSurface` (rendered after the HUD + inspect panel) and supersedes the
// old DOM #follow-hud strip. Read-only (no buttons), so it has NO input dispatcher; it keeps
// its own a11y mirror (a third hidden mount) so screen-reader users get the job/id/fsm/cargo.
// Open/close is driven entirely by the follow-cam: it is open iff `followId !== null`. The
// live villager is re-found each frame by id (villagers carry a stable id).
export let villagerPanel: VillagerPanel | undefined;
export let villagerMirror: A11yMirror | undefined;
// Villager-job code-review FIX B: the villager panel is a `panel` (background:true), so even
// though it has no buttons it should consume clicks on its rect — otherwise a click on the
// panel falls through to the world. It gets its own dispatcher (inert while not following),
// mirroring the inspect panel's pattern. Returns null root while not following → reports
// `consumed: false`, so forwarding events to it is a no-op when the panel is hidden.
export let villagerDispatcher: InputDispatcher | undefined;

// Follow-cam (brief 19): id of the villager the camera is locked onto, or null. The SOLE owner
// of this binding is this module — input.ts's idle-click handler and sim-client.ts's onSnapshot
// handler both go through `setFollowId` rather than reassigning it directly.
export let followId: number | null = null;
export function setFollowId(id: number | null): void {
  followId = id;
}

/**
 * Release the follow-cam and hide the in-canvas villager panel. Clears the panel's a11y mirror
 * on EVERY release path (Esc / click-away / minimap jump / despawn) so the hidden
 * #ui-a11y-villager DOM stops advertising the released villager (its readout must leave the
 * accessibility tree the moment the follow is gone).
 */
export function clearFollow(): void {
  followId = null;
  villagerMirror?.update(null);
}

/**
 * Villager-job chunk 3: the floating follow-a-villager panel as a FOURTH UI root. Read-only
 * (no buttons) → NO input dispatcher; events never need forwarding to it. It keeps its OWN
 * a11y mirror in a SEPARATE hidden mount (#ui-a11y-villager) so its readout's DOM subtree is
 * distinct from the HUD's and the inspect panel's. `villagerMirror.update(null)` clears it on
 * every follow-release path (Esc / click-away / minimap / despawn — all via clearFollow()).
 * Called once from boot.ts.
 */
export function initVillagerPanel(): void {
  villagerPanel = createVillagerPanel();
  // FIX B: a dispatcher that hit-tests the panel root only while following, so a click on the
  // panel's rect is consumed (UI-owned) and never reaches world build/pan. No buttons → no
  // focus/activation behaviour is needed; it exists purely for click consumption.
  villagerDispatcher = createInputDispatcher(() => (followId !== null ? villagerPanel?.root ?? null : null));
  if (villagerA11yMount !== null) {
    villagerMirror = createA11yMirror(villagerA11yMount, { rootLabel: "Followed villager" });
  }
}

// Build bar (DOM-overlay removal): a FIFTH in-canvas UI root — the placement toolbar,
// rendered at the bottom-left (supersedes the DOM #build-bar). Its OWN input dispatcher
// (always live — the bar is always visible) + a11y mirror (a fourth hidden mount). A small
// hover-info label above it shows the hovered button's cost/tier (preserving the old DOM
// `title` tooltip) — see render-loop.ts. `lastUiX/Y` (input.ts) track the pointer in CSS-logical
// px for the hover hit-test.
export let buildBar: BuildBar | undefined;
export let buildBarDispatcher: InputDispatcher | undefined;
export let buildBarMirror: A11yMirror | undefined;

/**
 * Build bar (DOM-overlay removal): a FIFTH UI root — the placement toolbar, in-canvas at the
 * bottom-left. Always visible → its dispatcher always returns the live root. onActivate calls
 * the SAME placement-mode setters the old DOM buttons drove (selectBuild / setTool). Its a11y
 * mirror lives in its own hidden mount (#ui-a11y-buildbar) so its Tab order is distinct. Called
 * once from boot.ts.
 */
export function initBuildBar(): void {
  buildBar = createBuildBar({ selectBuild, setTool });
  buildBarDispatcher = createInputDispatcher(() => buildBar?.root ?? null);
  if (buildBarA11yMount !== null) {
    buildBarMirror = createA11yMirror(buildBarA11yMount, {
      rootLabel: "Build toolbar",
      onFocusNode: (id) => {
        if (buildBarDispatcher === undefined) return;
        if (id === null) buildBarDispatcher.blur();
        else buildBarDispatcher.focus(id);
      },
    });
  }
}

/**
 * The placement-mode readout text (former `#lbl-mode` DOM content), rebuilt by
 * `updateModeLabel()` at the same event sites the old DOM assignment ran from (mode changes,
 * drag-length updates, live upgrade hint) — NOT recomputed every frame. render-loop.ts's loop()
 * reads this verbatim into `siegeHud.refresh()`'s `modeText` each frame.
 */
export let modeLabelText = "Mode: None";

/** Building whose footprint contains (tx,ty) in the latest snapshot, or null. */
function buildingAt(tx: number, ty: number): BuildingSnapshot | null {
  for (const b of currentBuildings) {
    if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return b;
  }
  return null;
}

/** Lightweight upgrade hint for the hovered building (cost + valid/locked). */
function upgradeHint(): string {
  const { tx, ty } = placementState.cursorTile();
  const b = buildingAt(tx, ty);
  if (b === null) return "Mode: Upgrade (click a building)";
  if (b.level >= BUILDING_MAX_LEVEL) return `Mode: Upgrade — ${b.type} is max level (L${b.level})`;
  const nextLevel = b.level + 1;
  const reqTier = b.level === 1 ? "Village" : "Town";
  const cost = upgradeCost(b.type, nextLevel);
  const costStr = Object.entries(cost)
    .map(([g, q]) => `${q} ${g}`)
    .join(", ");
  const locked = !tierAtLeast(peakTier as SettlementTier, reqTier);
  const status = locked ? ` [LOCKED: needs ${reqTier}]` : "";
  return `Mode: Upgrade ${b.type} → L${nextLevel} (${costStr})${status}`;
}

/**
 * While a road/wall drag is active, a " — N tiles" (with " · blocked" when the
 * route couldn't be cleared) suffix for the mode label, so the player sees the
 * run's length + legality live before releasing. Empty when not dragging.
 */
function dragLengthSuffix(): string {
  if (!placementState.isDraggingRoad) return "";
  const n = placementState.roadTiles.length;
  if (n === 0) return "";
  const blocked = placementState.lastRouteBlocked ? " · blocked" : "";
  return ` — ${n} tile${n === 1 ? "" : "s"}${blocked}`;
}

export function updateModeLabel(): void {
  const mode = placementState.mode;
  if (mode === "place") modeLabelText = `Mode: Place ${placementState.selectedType}`;
  else if (mode === "demolish") modeLabelText = "Mode: Demolish";
  else if (mode === "road") modeLabelText = `Mode: Road (drag)${dragLengthSuffix()}`;
  else if (mode === "wall") modeLabelText = `Mode: Wall (drag)${dragLengthSuffix()}`;
  else if (mode === "upgrade") modeLabelText = upgradeHint();
  else modeLabelText = "Mode: None";
  // The active-tool highlight now lives on the in-canvas build bar; it re-binds each frame
  // from `placementState` in the render loop (buildBar.refresh), so no DOM toggling here.
  // The text itself is read into siege-hud's `modeText` each frame in render-loop.ts (chunk 1A).
}

export function selectBuild(type: string): void {
  clearFollow(); // entering placement releases the follow-cam (mutually exclusive)
  placementState.mode = "place";
  placementState.selectedType = type;
  const def = getBuildingDef(type);
  if (def !== undefined) placementState.setFootprint(def.w, def.h);
  const prod = getProductionDef(type);
  placementState.setRequiresForest(prod?.terrainReq === "forest");
  placementState.setRequiresStone(prod?.terrainReq === "stone");
  updateModeLabel();
}

/**
 * Enter a standalone tool mode (road/wall/demolish/upgrade) or clear it ("none"). Wired as
 * the build bar's tool-button `onActivate` — the SAME placement-mode transitions the old DOM
 * `#btn-build-road/-wall/-demolish/-upgrade/-cancel` click handlers drove.
 */
export function setTool(tool: BuildTool): void {
  if (tool !== "none") clearFollow(); // entering placement releases the follow-cam
  placementState.mode = tool; // "road" | "wall" | "demolish" | "upgrade" | "none"
  if (tool === "road" || tool === "wall") {
    placementState.setRequiresForest(false);
    placementState.setRequiresStone(false);
  }
  updateModeLabel();
}
