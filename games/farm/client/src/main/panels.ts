/**
 * Farm Valley in-canvas panels — builds every `@engine/ui` panel and registers each as a root
 * with the shared {@link UIHost}. This is the integration seam that made all Farm UI in-canvas:
 * the old DOM panels (`../ui/*`) are gone; these are the ported `@engine/ui` trees under
 * `../ui/canvas/*`. The render loop drives their per-frame refresh/layout/renderTree.
 *
 * Each panel owns its own registered root (dispatcher + a11y mirror). Actions (farmer-select,
 * playback commands, share) are passed in by the host — the same command paths the old DOM
 * handlers drove.
 */
import { DebugOverlay } from "@engine/core";
import { createWorldClock } from "../ui/canvas/world-clock";
import type { WorldClock } from "../ui/canvas/world-clock";
import { createHotbar } from "../ui/canvas/hotbar";
import type { Hotbar } from "../ui/canvas/hotbar";
import { createTooltip } from "../ui/canvas/tooltip";
import type { Tooltip } from "../ui/canvas/tooltip";
import { createRightColumn } from "../ui/canvas/right-column";
import type { RightColumn } from "../ui/canvas/right-column";
import { createLeaderboard } from "../ui/canvas/leaderboard";
import type { Leaderboard } from "../ui/canvas/leaderboard";
import { createPlaybackControls } from "../ui/canvas/playback-controls";
import type { PlaybackControls, PlaybackActions } from "../ui/canvas/playback-controls";
import { createRelationshipMatrix } from "../ui/canvas/relationship-matrix";
import type { RelationshipMatrix } from "../ui/canvas/relationship-matrix";
import { createWealthGraph, createWealthToggle } from "../ui/canvas/wealth-graph";
import type { WealthGraph, WealthToggle } from "../ui/canvas/wealth-graph";
import { createPanelPrefs } from "../ui/canvas/panel-prefs";
import type { PanelPrefs } from "../ui/canvas/panel-prefs";
import { createGameOverPanel } from "../ui/canvas/game-over";
import type { GameOverPanel } from "../ui/canvas/game-over";
import { createInventory } from "../ui/canvas/inventory";
import type { Inventory } from "../ui/canvas/inventory";
import { createInspectPanel } from "../ui/canvas/inspect-panel";
import type { InspectPanel } from "../ui/canvas/inspect-panel";
import { createNoticeBoard, createStandingsPost } from "../ui/canvas/diegetic-hud";
import type { NoticeBoard, StandingsPost } from "../ui/canvas/diegetic-hud";
import type { UIHost, UIRootHandle } from "../ui/canvas/ui-host";

/** The commands the panels invoke back into the host. */
export interface PanelActions {
  /** Follow (or, passing `null`, unfollow) a farmer — the focus-farmer command. */
  onSelectFarmer(id: number | null): void;
  /** Playback controls (togglePause/setSpeed/step/skipToHighlight). */
  playback: PlaybackActions;
  /** "Share this run" was clicked in the game-over panel. */
  onShare(): void;
  /** Owner-gated slot swap for the inventory drag-to-rearrange. */
  swapSlots(from: number, to: number): void;
  /** Whether the local client owns Pip (gates inventory drag + hotbar input). */
  isOwner(): boolean;
}

/** Every canvas panel + its registered root handle (for a11y-mirror updates + visibility gating). */
export interface Panels {
  overlay: DebugOverlay;
  worldClock: WorldClock;
  clockRoot: UIRootHandle;
  hotbar: Hotbar;
  hotbarRoot: UIRootHandle;
  tooltip: Tooltip;
  tooltipRoot: UIRootHandle;
  rightColumn: RightColumn;
  rightColumnRoot: UIRootHandle;
  leaderboard: Leaderboard;
  leaderboardRoot: UIRootHandle;
  playback: PlaybackControls;
  playbackRoot: UIRootHandle;
  helpRoot: UIRootHandle;
  relationshipMatrix: RelationshipMatrix;
  relationshipRoot: UIRootHandle;
  wealthGraph: WealthGraph;
  wealthToggle: WealthToggle;
  wealthRoot: UIRootHandle;
  /** Shared collapsible-panel open/closed store (observer/slate/events/relations/wealth). */
  panelPrefs: PanelPrefs;
  gameOverPanel: GameOverPanel;
  gameOverRoot: UIRootHandle;
  inventory: Inventory;
  /** World-anchored inspect card that tracks the followed farmer (reinvention: world-anchored UI). */
  inspectPanel: InspectPanel;
  inspectRoot: UIRootHandle;
  /** Diegetic HUD (reinvention): the in-world notice-board (events) + standings post (day/top-3). */
  noticeBoard: NoticeBoard;
  noticeBoardRoot: UIRootHandle;
  standingsPost: StandingsPost;
  standingsPostRoot: UIRootHandle;
}

function mount(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/** `window.localStorage` can itself throw in strict-privacy browser modes (not just on get/set
 *  item) — guard the access, not just the calls, and fall back to in-memory prefs. */
function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Build + register every in-canvas panel with the host. Returns the panel handles the render loop
 * drives. `app` still hosts the (dev-only) DebugOverlay; every other surface is now in-canvas.
 */
export function buildPanels(
  app: HTMLElement,
  host: UIHost,
  canvas: HTMLCanvasElement,
  actions: PanelActions,
): Panels {
  const overlay = new DebugOverlay(app);

  // Shared collapsible-panel open/closed store (brief 117) — built once, passed into every
  // collapsible panel factory below.
  const panelPrefs = createPanelPrefs(safeLocalStorage());

  const worldClock = createWorldClock();
  const clockRoot = host.registerRoot({
    getRoot: () => worldClock.root,
    a11yMount: mount("ui-a11y-clock"),
    a11yLabel: "World clock",
  });

  const hotbar = createHotbar({
    canvas,
    swapSlots: actions.swapSlots,
    isOwner: actions.isOwner,
  });
  const hotbarRoot = host.registerRoot({
    getRoot: () => hotbar.root,
    a11yMount: mount("ui-a11y-hotbar"),
    a11yLabel: "Hotbar",
  });

  const tooltip = createTooltip();
  const tooltipRoot = host.registerRoot({ getRoot: () => (tooltip.isVisible() ? tooltip.root : null) });

  const rightColumn = createRightColumn({ onSelectFarmer: actions.onSelectFarmer }, panelPrefs);
  const rightColumnRoot = host.registerRoot({
    getRoot: () => rightColumn.root,
    a11yMount: mount("ui-a11y-right"),
    a11yLabel: "Observer panels",
  });

  const leaderboard = createLeaderboard();
  let leaderboardOpen = false;
  const leaderboardRoot = host.registerRoot({
    getRoot: () => (leaderboardOpen ? leaderboard.root : null),
    a11yMount: mount("ui-a11y-leaderboard"),
    a11yLabel: "Standings",
  });
  // Expose open/close via the handle's dispatcher is not enough — the render loop toggles a flag.
  // Attach the toggle state onto the leaderboard object via a wrapper the loop can flip.
  (leaderboard as Leaderboard & { setOpen(v: boolean): void; isOpen(): boolean; toggle(): void }).setOpen = (
    v: boolean,
  ) => {
    leaderboardOpen = v;
  };
  (leaderboard as Leaderboard & { isOpen(): boolean }).isOpen = () => leaderboardOpen;
  (leaderboard as Leaderboard & { toggle(): void }).toggle = () => {
    leaderboardOpen = !leaderboardOpen;
  };

  const playback = createPlaybackControls(actions.playback);
  const playbackRoot = host.registerRoot({
    getRoot: () => playback.root,
    a11yMount: mount("ui-a11y-playback"),
    a11yLabel: "Playback controls",
  });
  const helpRoot = host.registerRoot({
    getRoot: () => playback.getHelpRoot(),
    a11yMount: mount("ui-a11y-help"),
    a11yLabel: "How to play",
  });

  const relationshipMatrix = createRelationshipMatrix(panelPrefs);
  const relationshipRoot = host.registerRoot({
    getRoot: () => relationshipMatrix.root,
    a11yMount: mount("ui-a11y-relationship"),
    a11yLabel: "Relationships",
  });

  const wealthGraph = createWealthGraph();
  const wealthToggle = createWealthToggle(panelPrefs);
  const wealthRoot = host.registerRoot({
    getRoot: () => wealthToggle.root,
    a11yMount: mount("ui-a11y-wealth"),
    a11yLabel: "Wealth graph",
  });

  const gameOverPanel = createGameOverPanel({ onShare: actions.onShare });
  let gameOverOpen = false;
  const gameOverRoot = host.registerRoot({
    getRoot: () => (gameOverOpen ? gameOverPanel.root : null),
    a11yMount: mount("ui-a11y-gameover"),
    a11yLabel: "Final standings",
  });
  (gameOverPanel as GameOverPanel & { setOpen(v: boolean): void; isOpen(): boolean }).setOpen = (v: boolean) => {
    gameOverOpen = v;
  };
  (gameOverPanel as GameOverPanel & { isOpen(): boolean }).isOpen = () => gameOverOpen;

  const inventory = createInventory({
    canvas,
    host,
    a11yMount: mount("ui-a11y-inventory"),
    swapSlots: actions.swapSlots,
    isOwner: actions.isOwner,
  });

  // World-anchored inspect card — visible only while a farmer is followed. The render loop flips
  // `inspectVisible` (it owns focusedFarmerId) and anchors the root over the farmer each frame.
  const inspectPanel = createInspectPanel();
  let inspectVisible = false;
  const inspectRoot = host.registerRoot({
    getRoot: () => (inspectVisible ? inspectPanel.root : null),
    a11yMount: mount("ui-a11y-inspect"),
    a11yLabel: "Followed farmer",
  });
  (inspectPanel as InspectPanel & { setVisible(v: boolean): void }).setVisible = (v: boolean) => {
    inspectVisible = v;
  };

  // Diegetic HUD — always-registered roots; the render loop anchors them to their world structures
  // (or screen-centres them while summoned) and drives their refresh.
  const noticeBoard = createNoticeBoard();
  const noticeBoardRoot = host.registerRoot({
    getRoot: () => noticeBoard.root,
    a11yMount: mount("ui-a11y-notice"),
    a11yLabel: "Notice board",
  });
  const standingsPost = createStandingsPost();
  const standingsPostRoot = host.registerRoot({
    getRoot: () => standingsPost.root,
    a11yMount: mount("ui-a11y-standings"),
    a11yLabel: "Standings post",
  });

  return {
    overlay,
    worldClock,
    clockRoot,
    hotbar,
    hotbarRoot,
    tooltip,
    tooltipRoot,
    rightColumn,
    rightColumnRoot,
    leaderboard,
    leaderboardRoot,
    playback,
    playbackRoot,
    helpRoot,
    relationshipMatrix,
    relationshipRoot,
    wealthGraph,
    wealthToggle,
    wealthRoot,
    panelPrefs,
    gameOverPanel,
    gameOverRoot,
    inventory,
    inspectPanel,
    inspectRoot,
    noticeBoard,
    noticeBoardRoot,
    standingsPost,
    standingsPostRoot,
  };
}
