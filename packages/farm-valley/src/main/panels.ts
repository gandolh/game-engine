import {
  DebugOverlay,
} from "@engine/core";
import {
  ObserverPanel,
  LeaderboardPanel,
  SlateBillboardPanel,
  PlaybackControlsPanel,
  HotbarPanel,
  EventFeedPanel,
  createRightColumn,
  WorldClockPanel,
  RelationshipMatrixPanel,
  WealthGraphPanel,
} from "../ui";
import { createGameOverPanel, type GameOverPanel } from "./game-over";

// ── Panel bundle ─────────────────────────────────────────────────────────────

export interface Panels {
  overlay: DebugOverlay;
  worldClock: WorldClockPanel;
  observer: ObserverPanel;
  leaderboardPanel: LeaderboardPanel;
  slateBillboard: SlateBillboardPanel;
  eventFeedPanel: EventFeedPanel;
  playback: PlaybackControlsPanel;
  hotbar: HotbarPanel;
  gameOverPanel: GameOverPanel;
  relationshipMatrix: RelationshipMatrixPanel;
  wealthGraph: WealthGraphPanel;
}

// Re-export GameOverPanel so consumers of Panels don't need a second import.
export type { GameOverPanel };

// Construct all UI panels and mount them into `app`. The observer and event
// feed share a right-edge flex column (brief 25) so they stack correctly.
export function buildPanels(app: HTMLElement): Panels {
  const overlay = new DebugOverlay(app);
  const worldClock = new WorldClockPanel(app);
  // brief 25 — observer + activity feed share one fixed right-edge flex
  // column so they stack instead of overlapping; the feed reflows below the
  // observer when the "why" block expands it.
  const rightColumn = createRightColumn(app);
  // Speed/time controls now live at the TOP of the right sidebar (the bottom-
  // center spot they used to occupy is the player tool hotbar). They mount
  // first so they sit above the observer/feed in the column.
  const playback = new PlaybackControlsPanel(rightColumn);
  const observer = new ObserverPanel(rightColumn);
  const leaderboardPanel = new LeaderboardPanel(app);
  const slateBillboard = new SlateBillboardPanel(app);
  const eventFeedPanel = new EventFeedPanel(rightColumn);
  // brief 37 — relationship matrix panel: mounts at the bottom of the right
  // column (below the event feed), showing the N×N trust grid.
  const relationshipMatrix = new RelationshipMatrixPanel(rightColumn);
  // brief 39 — wealth-over-time graph: mounts below the relationship matrix
  // (at the very bottom of the right column). Collapsed by default so it
  // doesn't crowd the other panels; click the header to expand.
  const wealthGraph = new WealthGraphPanel(rightColumn);
  // Player tool hotbar — bottom-center, where the playback controls used to be.
  const hotbar = new HotbarPanel(app);
  const gameOverPanel = createGameOverPanel(app);
  return {
    overlay,
    worldClock,
    observer,
    leaderboardPanel,
    slateBillboard,
    eventFeedPanel,
    playback,
    hotbar,
    gameOverPanel,
    relationshipMatrix,
    wealthGraph,
  };
}
