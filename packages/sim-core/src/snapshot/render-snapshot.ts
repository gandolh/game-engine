
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
  PlayerInventory,
} from "./panels";

export interface RenderSnapshot {

  tick: number;

  day: number;

  sprites: SnapshotSprite[];

  meets: SnapshotMeet[];

  events: SnapshotEvent[];

  observer: ObserverSnapshot;

  leaderboard: LeaderboardRow[];

  slate: ShopOffer[];

  entityCount: number;

  shock: SnapshotShock | null;

  gameOver: boolean;

  finalSummary: FinalStandingRow[] | null;

  recap: RunRecap | null;

  playerHotbar: PlayerHotbar | null;

  playerInventory: PlayerInventory | null;

  relationships: RelationshipMatrixData;

  rivalries: SnapshotRivalry[];

  wealthSeries: SnapshotWealthSeries[] | null;

  weather: {
    condition: import("../protocols/weather").WeatherCondition;
    season: import("../protocols/weather").Season;
  };

  festival: { id: string; name: string; contestCrop: string } | null;
}
