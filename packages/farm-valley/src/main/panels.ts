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

export type { GameOverPanel };

// Construct all UI panels and mount them into `app`.
export function buildPanels(app: HTMLElement): Panels {
  const overlay = new DebugOverlay(app);
  const worldClock = new WorldClockPanel(app);
  // Observer + feed share a right-edge flex column so they stack, not overlap.
  const rightColumn = createRightColumn(app);
  const playback = new PlaybackControlsPanel(rightColumn);
  const observer = new ObserverPanel(rightColumn);
  const leaderboardPanel = new LeaderboardPanel(app);
  const slateBillboard = new SlateBillboardPanel(app);
  const eventFeedPanel = new EventFeedPanel(rightColumn);
  const relationshipMatrix = new RelationshipMatrixPanel(rightColumn);
  const wealthGraph = new WealthGraphPanel(rightColumn);
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
