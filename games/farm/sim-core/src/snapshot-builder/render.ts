import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import type { DayClockSystem } from "../systems/world-time/day-clock";
import type { MeetIndicatorSystem } from "../systems/social/meet-indicator";
import type { EventFeedSystem } from "../systems/event-feed";
import type { RunHistoryRow } from "../systems/messaging/run-history";
import type { RivalrySystem } from "../systems/rivalry";
import type {
  RenderSnapshot,
  SnapshotShock,
} from "../snapshot";
import { leaderboard } from "../sim-bootstrap";
import { seasonForDay } from "../protocols";
import { summarizeRun } from "../run-recap";

import { buildSprites, buildPlayerHotbar, buildPlayerInventory, SnapshotSpriteState } from "./sprites";
import { buildMeets, buildEvents } from "./events";
import { buildObserverSnapshot, countEntities } from "./observer";
import {
  buildLeaderboardRows,
  buildFinalStandings,
  buildRelationshipsData,
  buildRivalriesData,
  buildWealthSeries,
} from "./panels";

export function buildRenderSnapshot(
  world: World<GameEntity>,
  dayClock: DayClockSystem,
  meetIndicators: MeetIndicatorSystem,
  eventFeed: EventFeedSystem,
  tick: number,
  maxDays: number,
  pendingShock: SnapshotShock | null,
  runHistoryRows: readonly RunHistoryRow[] = [],
  rivalrySystem?: RivalrySystem,
  spriteState?: SnapshotSpriteState,
): RenderSnapshot {
  const day = dayClock.day;
  const gameOver = day >= maxDays;

  const sprites = buildSprites(world, tick, day, spriteState);
  const meets = buildMeets(meetIndicators, tick);
  const events = buildEvents(eventFeed);
  const observer = buildObserverSnapshot(world, day);
  const lb = leaderboard(world);
  const lbRows = buildLeaderboardRows(lb);

  const shopEntity = (() => {
    for (const s of world.query("shopkeeper")) return s;
    return null;
  })();
  const slate = (shopEntity?.shopkeeper?.dailySlate ?? []) as import("../agents/shop-slate").ShopOffer[];

  const entityCount = countEntities(world);

  const finalSummary = gameOver ? buildFinalStandings(lb) : null;

  const rivalries = buildRivalriesData(rivalrySystem);
  const relationships = buildRelationshipsData(world);

  const recap = gameOver && finalSummary !== null
    ? summarizeRun(runHistoryRows, eventFeed.recent(), finalSummary, rivalries)
    : null;
  const playerInventory = buildPlayerInventory(world);
  const playerHotbar = buildPlayerHotbar(playerInventory);

  const station = (() => {
    for (const w of world.query("weatherStation")) return w.weatherStation;
    return null;
  })();
  const weather = {
    condition: station?.current ?? ("normal" as const),
    season: station?.season ?? seasonForDay(day),
  };
  const todaysFestival = dayClock.festivalToday;
  const festival = todaysFestival
    ? { id: todaysFestival.id, name: todaysFestival.name, contestCrop: todaysFestival.contestCrop }
    : null;

  let wealthSeries: RenderSnapshot["wealthSeries"];
  if (spriteState === undefined) {
    wealthSeries = buildWealthSeries(world, runHistoryRows);
  } else if (spriteState.wealthRowsSent !== runHistoryRows.length) {
    spriteState.wealthRowsSent = runHistoryRows.length;
    wealthSeries = buildWealthSeries(world, runHistoryRows);
  } else {
    wealthSeries = null;
  }

  return {
    tick,
    day,
    sprites,
    meets,
    events,
    observer,
    leaderboard: lbRows,
    slate,
    entityCount,
    shock: pendingShock,
    gameOver,
    finalSummary,
    recap,
    playerHotbar,
    playerInventory,
    relationships,
    rivalries,
    wealthSeries,
    weather,
    festival,
  };
}
