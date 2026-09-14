/**
 * UI-panel rendering for the Farm render loop (audit-25 slice 4/4): every `@engine/ui` surface
 * pass — world clock, right column, hotbar, playback controls, leaderboard, inventory modal, hover
 * tooltip, the world-anchored cards (inspect card / diegetic HUD / Pip's-farm marker, via
 * `render-world-anchored-cards.ts`), the help modal, and the game-over screen.
 *
 * Split out of `renderFrame`'s `frameProfiler.time("panels", ...)` block verbatim: same
 * refresh/computeLayout/renderTree sequence, same draw order (world clock → right column → hotbar
 * → [tool cursor] → playback → leaderboard → inventory → tooltip → world-anchored cards → help →
 * game over, LAST so it overlays everything). `renderUiPanels` is the one entry point — it owns the
 * `surface.begin()`/`end()` bracket the whole sequence must run inside, then delegates each panel to
 * its own small function, each taking explicit parameters instead of closing over `renderFrame`'s
 * locals. `layoutCache` replaces the two `let` locals (`rcLaidOutW`/`hbLaidOutSize`) that used to
 * live in `renderFrame`'s closure — a plain mutable object, owned by `createRenderLoop` and passed
 * in every frame, so state still persists across frames without either extracted function keeping
 * its own copy.
 */
import type { Camera2D } from "@engine/core";
import { computeLayout, renderTree } from "@engine/ui";
import type { UISurface } from "@engine/ui";
import type { SnapshotSprite, RenderSnapshot } from "@farm/sim-core/snapshot";
import type { SimClient } from "../net/sim-client";
import type { Panels } from "./panels";
import type { Leaderboard } from "../ui/canvas/leaderboard";
import type { GameOverPanel } from "../ui/canvas/game-over";
import type { InspectPanel } from "../ui/canvas/inspect-panel";
import type { PipFarmMarker } from "./pip-farm-marker";
import { hoveredSprite } from "./tooltip";
import { TOOLTIP_CURSOR_OFFSET } from "../ui/canvas/tooltip";
import { playbackState } from "./playback";
import { renderWorldAnchoredCards } from "./render-world-anchored-cards";

/** Cross-frame layout-relayout cache: a fixed-content panel relayouts on canvas-size change even
 *  when its own `refresh()` reports unchanged (its screen anchor depends on canvas dimensions). One
 *  instance, owned by `createRenderLoop`, passed into `renderUiPanels` every frame. */
export interface LayoutCache {
  rightColumnWidth: number;
  hotbarCanvasSize: string;
}

export function createLayoutCache(): LayoutCache {
  return { rightColumnWidth: -1, hotbarCanvasSize: "" };
}

/** Everything `renderUiPanels` and its sub-functions need, beyond the `panels` bundle itself. */
export interface UiPanelsContext {
  surface: UISurface;
  canvas: HTMLCanvasElement;
  camera: Camera2D | null;
  zoom: number;
  nowMs: number;
  ticksPerDay: number;
  seed: number;
  mousePos: { x: number; y: number };
  interpolatedSprites: SnapshotSprite[];
  focusedFarmerId: number | null;
  farmerPositions: ReadonlyMap<number, { x: number; y: number }>;
  hudSummoned: boolean;
  client: SimClient;
  /** This frame's `client.latestSnapshot()`, taken once by the caller and reused here (game-over
   *  panel's `finalDay`). */
  snap: RenderSnapshot | null;
  getShareStatus: () => string;
  /** Sets the canvas cursor from the player's held hotbar tool; called right after the hotbar
   *  panel renders, matching the original inline position. Owns its own `lastCursorKey` cache in
   *  `render-loop.ts` — untouched by this split. */
  applyToolCursor: () => void;
  layoutCache: LayoutCache;
  leaderboardCtl: Leaderboard & { setOpen(v: boolean): void; isOpen(): boolean; toggle(): void };
  gameOverCtl: GameOverPanel & { setOpen(v: boolean): void; isOpen(): boolean };
  inspectCtl: InspectPanel & { setVisible(v: boolean): void };
  pipMarker: PipFarmMarker;
}

/** World clock — top-centre. */
function renderWorldClockPanel(panels: Panels, ctx: UiPanelsContext): void {
  const { surface, canvas, client, ticksPerDay } = ctx;
  const { worldClock, clockRoot } = panels;
  if (worldClock.refresh({ tick: client.tick, ticksPerDay, day: client.day })) {
    computeLayout(worldClock.root, 0, 0);
    const cx = Math.max(0, (canvas.clientWidth - worldClock.root.rect.width) / 2);
    computeLayout(worldClock.root, cx, 0);
    clockRoot.mirror?.update(worldClock.root);
  }
  renderTree(surface, worldClock.root);
}

/** Right column (observer + slate + event feed) — pinned top-right. Relationship matrix + wealth
 *  graph/toggle are DOCKED inside it (refresh/render/a11y-mirror all flow through here too). */
function renderRightColumnPanel(panels: Panels, ctx: UiPanelsContext): void {
  const { surface, canvas, client, layoutCache } = ctx;
  const { rightColumn, rightColumnRoot } = panels;
  const obs = client.observer;
  if (obs !== null) {
    const rcChanged = rightColumn.refresh({
      observer: obs,
      slate: client.slate,
      events: client.events,
      relationships: client.relationships,
      wealthSeries: client.wealthSeries,
    });
    if (rcChanged || layoutCache.rightColumnWidth !== canvas.clientWidth) {
      computeLayout(rightColumn.root, 0, 0);
      layoutCache.rightColumnWidth = canvas.clientWidth;
      const rx = Math.max(0, canvas.clientWidth - rightColumn.root.rect.width - 8);
      computeLayout(rightColumn.root, rx, 40);
      rightColumnRoot.mirror?.update(rightColumn.root);
    }
    renderTree(surface, rightColumn.root);
    // (Slate crop icons + stock-bar fills now paint via an overlay custom node inside the tree,
    // so `renderTree` above already drew them — no separate icon pass here.)
  }
}

/** Hotbar — bottom-centre, then the tool cursor (reads the just-laid-out selection). */
function renderHotbarPanel(panels: Panels, ctx: UiPanelsContext): void {
  const { surface, canvas, client, layoutCache, applyToolCursor } = ctx;
  const { hotbar, hotbarRoot } = panels;
  if (hotbar.refresh(client.playerHotbar)) {
    computeLayout(hotbar.root, 0, 0);
    const hx = Math.max(0, (canvas.clientWidth - hotbar.root.rect.width) / 2);
    const hy = Math.max(0, canvas.clientHeight - hotbar.root.rect.height - 8);
    computeLayout(hotbar.root, hx, hy);
    hotbarRoot.mirror?.update(hotbar.root);
  } else if (layoutCache.hotbarCanvasSize !== `${canvas.clientWidth}x${canvas.clientHeight}`) {
    computeLayout(hotbar.root, 0, 0);
    const hx = Math.max(0, (canvas.clientWidth - hotbar.root.rect.width) / 2);
    const hy = Math.max(0, canvas.clientHeight - hotbar.root.rect.height - 8);
    computeLayout(hotbar.root, hx, hy);
    layoutCache.hotbarCanvasSize = `${canvas.clientWidth}x${canvas.clientHeight}`;
  }
  renderTree(surface, hotbar.root);
  // (Slot icons, selected border, and drag ghost paint via the hotbar's overlay custom node,
  // already drawn by renderTree above — no separate icon/ghost pass here.)
  applyToolCursor();
}

/** Playback controls — bottom-right (owner only; the a11y root is inert while hidden). */
function renderPlaybackPanel(panels: Panels, ctx: UiPanelsContext): void {
  const { surface, canvas, client } = ctx;
  const { playback, playbackRoot } = panels;
  if (!client.owner) return;
  if (playback.refresh({ paused: playbackState.paused, speed: playbackState.speed })) {
    computeLayout(playback.root, 0, 0);
    const px = Math.max(0, canvas.clientWidth - playback.root.rect.width - 8);
    const py = Math.max(0, canvas.clientHeight - playback.root.rect.height - 8);
    computeLayout(playback.root, px, py);
    playbackRoot.mirror?.update(playback.root);
  }
  renderTree(surface, playback.root);
}

/** Leaderboard — centred overlay, open on Tab. */
function renderLeaderboardPanel(panels: Panels, ctx: UiPanelsContext): void {
  const { surface, canvas, client, leaderboardCtl } = ctx;
  const { leaderboard, leaderboardRoot } = panels;
  if (!leaderboardCtl.isOpen()) return;
  if (leaderboard.refresh(client.leaderboard)) {
    computeLayout(leaderboard.root, 0, 0);
    const lx = Math.max(0, (canvas.clientWidth - leaderboard.root.rect.width) / 2);
    const ly = Math.max(0, (canvas.clientHeight - leaderboard.root.rect.height) / 2);
    computeLayout(leaderboard.root, lx, ly);
    leaderboardRoot.mirror?.update(leaderboard.root);
  }
  renderTree(surface, leaderboard.root);
}

/** Inventory modal — centred (its own drag listeners live in the panel). */
function renderInventoryPanel(panels: Panels, ctx: UiPanelsContext): void {
  const { surface, canvas, client } = ctx;
  const { inventory } = panels;
  const invRoot = inventory.getRoot();
  if (invRoot === null) return;
  if (inventory.refresh(client.playerInventory)) {
    computeLayout(invRoot, 0, 0);
    const ix = Math.max(0, (canvas.clientWidth - invRoot.rect.width) / 2);
    const iy = Math.max(0, (canvas.clientHeight - invRoot.rect.height) / 2);
    computeLayout(invRoot, ix, iy);
    inventory.rootHandle.mirror?.update(invRoot);
  }
  renderTree(surface, invRoot);
  // (Slot icons, selected borders, and drag ghost paint via the inventory's overlay custom
  // node, already drawn by renderTree above — no separate icon/ghost pass here.)
}

/** Hover tooltip — anchored near the cursor, drawn late so it sits over other panels. Reuses this
 *  frame's `interpolatedSprites`; a second `getInterpolatedSprites()` call here would
 *  double-decrement hitstopFramesLeft and halve the intended hitstop duration. */
function renderHoverTooltipPanel(panels: Panels, ctx: UiPanelsContext): void {
  const { surface, canvas, camera, mousePos, interpolatedSprites } = ctx;
  const { tooltip } = panels;
  const hovered = hoveredSprite(canvas, interpolatedSprites, camera);
  tooltip.refresh({ label: hovered?.label ?? null, description: hovered?.description ?? null });
  if (tooltip.isVisible()) {
    computeLayout(tooltip.root, mousePos.x + TOOLTIP_CURSOR_OFFSET.dx, mousePos.y + TOOLTIP_CURSOR_OFFSET.dy);
    renderTree(surface, tooltip.root);
  }
}

/** Help modal — centred, top-most non-terminal overlay. */
function renderHelpModalPanel(panels: Panels, ctx: UiPanelsContext): void {
  const { surface, canvas } = ctx;
  const { playback, helpRoot } = panels;
  const helpRootNode = playback.getHelpRoot();
  if (helpRootNode === null) return;
  computeLayout(helpRootNode, 0, 0);
  const hx = Math.max(0, (canvas.clientWidth - helpRootNode.rect.width) / 2);
  const hy = Math.max(0, (canvas.clientHeight - helpRootNode.rect.height) / 2);
  computeLayout(helpRootNode, hx, hy);
  helpRoot.mirror?.update(helpRootNode);
  renderTree(surface, helpRootNode);
}

/** Game over — centred, drawn LAST so it overlays everything when the run ends. */
function renderGameOverPanel(panels: Panels, ctx: UiPanelsContext): void {
  const { surface, canvas, client, seed, snap, getShareStatus, gameOverCtl } = ctx;
  const { gameOverPanel, gameOverRoot } = panels;
  if (!gameOverCtl.isOpen()) return;
  const final = client.finalSummary;
  if (final === null) return;
  if (gameOverPanel.refresh({
    rows: final,
    finalDay: snap?.day ?? 0,
    seed,
    recap: client.recap,
    shareStatus: getShareStatus(),
  })) {
    computeLayout(gameOverPanel.root, 0, 0);
    const gx = Math.max(0, (canvas.clientWidth - gameOverPanel.root.rect.width) / 2);
    const gy = Math.max(0, (canvas.clientHeight - gameOverPanel.root.rect.height) / 2);
    computeLayout(gameOverPanel.root, gx, gy);
    gameOverRoot.mirror?.update(gameOverPanel.root);
  }
  renderTree(surface, gameOverPanel.root);
}

/**
 * Submit the whole `@engine/ui` layer for this frame, through the shared surface, BEFORE
 * `renderer.endFrame()` (the renderer flushes the UI draw-list inside `endFrame`, painting it over
 * the world). Draw order — preserved exactly from the original inline block — is behaviour: world
 * clock, right column, hotbar (+ tool cursor), playback, leaderboard, inventory, hover tooltip, the
 * world-anchored cards, help modal, then game-over LAST.
 */
export function renderUiPanels(panels: Panels, ctx: UiPanelsContext): void {
  const surface = ctx.surface;
  surface.begin();

  renderWorldClockPanel(panels, ctx);
  renderRightColumnPanel(panels, ctx);
  // (Relationship matrix + wealth graph/toggle are DOCKED inside the right column — they refresh +
  // render + a11y-mirror through renderRightColumnPanel above, so there is no separate bottom-left
  // pass here. The R/G hotkeys in render-loop.ts still drive their own collapse toggles.)
  renderHotbarPanel(panels, ctx);
  renderPlaybackPanel(panels, ctx);
  renderLeaderboardPanel(panels, ctx);
  renderInventoryPanel(panels, ctx);
  renderHoverTooltipPanel(panels, ctx);

  // World-anchored cards (reinvention): the followed-farmer inspect card, the diegetic HUD
  // (notice-board + standings-post), and the Pip's-farm marker all track a world position each
  // frame instead of a fixed screen slot.
  renderWorldAnchoredCards({
    surface, canvas: ctx.canvas, camera: ctx.camera, zoom: ctx.zoom, nowMs: ctx.nowMs,
    ticksPerDay: ctx.ticksPerDay, hudSummoned: ctx.hudSummoned,
    focusedFarmerId: ctx.focusedFarmerId, farmerPositions: ctx.farmerPositions, client: ctx.client,
    inspectPanel: panels.inspectPanel, inspectRoot: panels.inspectRoot, inspectCtl: ctx.inspectCtl,
    noticeBoard: panels.noticeBoard, noticeBoardRoot: panels.noticeBoardRoot,
    standingsPost: panels.standingsPost, standingsPostRoot: panels.standingsPostRoot,
    pipMarker: ctx.pipMarker,
  });

  renderHelpModalPanel(panels, ctx);
  renderGameOverPanel(panels, ctx);

  surface.end();
}
