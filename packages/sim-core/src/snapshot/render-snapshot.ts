// RenderSnapshot — the big per-tick aggregate that the sim worker posts to the
// main thread. Structured-clone-friendly: plain objects, no Maps/Sets.
//
// The Worker posts one RenderSnapshot per tick over postMessage (no
// SharedArrayBuffer); the main thread keeps the latest two and interpolates
// sprite positions between them using alpha.

import type { ObserverSnapshot } from "./observer-types";
import type { LeaderboardRow } from "./ui-types";
import type { ShopOffer } from "../agents/shop-slate";
import type { RunRecap } from "../run-recap";
import type { RelationshipMatrixData } from "./ui-types";
import type { SnapshotSprite, SnapshotMeet, SnapshotEvent, SnapshotShock } from "./sprites";
import type {
  SnapshotWealthSeries,
  SnapshotRivalry,
  FinalStandingRow,
  PlayerHotbar,
} from "./panels";

/** Full per-tick render + UI snapshot. */
export interface RenderSnapshot {
  /** Sim tick this snapshot was produced on. */
  tick: number;
  /** Current sim day. */
  day: number;
  /** Sprites to draw (dynamic layer only; the static backdrop is baked once). */
  sprites: SnapshotSprite[];
  /** Active MEET indicators this tick. */
  meets: SnapshotMeet[];
  /** Activity-feed lines (oldest-first, capped); panel renders newest-first. */
  events: SnapshotEvent[];
  /** Observer panel data. */
  observer: ObserverSnapshot;
  /** Leaderboard rows. */
  leaderboard: LeaderboardRow[];
  /** Shop daily slate for the billboard. */
  slate: ShopOffer[];
  /** transform + plot entity count for the debug overlay. */
  entityCount: number;
  /** Set on the snapshot a shock fires; null otherwise. */
  shock: SnapshotShock | null;
  /** True once the sim reaches maxDays — main thread shows game-over. */
  gameOver: boolean;
  /** Final standings with crop counts, present only when gameOver is true. */
  finalSummary: FinalStandingRow[] | null;
  /**
   * End-of-run recap (standings with rank-delta, per-farmer arcs, headline).
   * Present only when gameOver is true; null otherwise.
   */
  recap: RunRecap | null;
  /** Player hotbar state, or null when there is no player-controlled farmer. */
  playerHotbar: PlayerHotbar | null;
  /**
   * Trust matrix for the relationship grid panel. Contains each farmer's trust
   * toward every peer as a plain Record (structured-clone-friendly).
   * Brief 37.
   */
  relationships: RelationshipMatrixData;
  /**
   * Active named rivalries (accumulated adverse history ≥ threshold) with
   * resolved farmer names for the panel and end-of-run recap. Brief 37.
   */
  rivalries: SnapshotRivalry[];
  /**
   * Per-farmer wealth time series for the wealth-over-time line chart.
   * One entry per farmer, with all per-day gold rows captured so far.
   * Live-updated every snapshot so the chart redraws as the run progresses.
   * Brief 39.
   */
  wealthSeries: SnapshotWealthSeries[];
  /**
   * brief 45 — current weather + season, for the render-only rain/snow ambient
   * overlay (main.ts) and any weather UI. Pure render input — drawn over the
   * frame, never read by sim logic.
   */
  weather: {
    condition: import("../protocols/weather").WeatherCondition;
    season: import("../protocols/weather").Season;
  };
  /**
   * brief 45 — the festival firing today, or null. Lets the UI surface the
   * calendar landmark. Pure render input.
   */
  festival: { id: string; name: string; contestCrop: string } | null;
}
