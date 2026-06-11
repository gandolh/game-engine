// Per-tick aggregate posted from sim Worker to main thread. Structured-clone-friendly (plain objects only).
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
  /** Trust matrix for the relationship grid panel. Plain Record — structured-clone-friendly. */
  relationships: RelationshipMatrixData;
  /** Active named rivalries (adverse history ≥ threshold) with resolved farmer names. */
  rivalries: SnapshotRivalry[];
  /**
   * Per-farmer wealth time series. Sent only when row count changed (server path with
   * SnapshotSpriteState); null otherwise — client caches the last non-null value.
   * Builders without per-run state (tests) send it every tick.
   */
  wealthSeries: SnapshotWealthSeries[] | null;
  /** Current weather + season for the render-only rain/snow overlay. Never read by sim logic. */
  weather: {
    condition: import("../protocols/weather").WeatherCondition;
    season: import("../protocols/weather").Season;
  };
  /** The festival firing today, or null. Lets the UI surface the calendar landmark. */
  festival: { id: string; name: string; contestCrop: string } | null;
}
