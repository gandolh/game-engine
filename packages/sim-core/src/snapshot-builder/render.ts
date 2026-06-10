/**
 * snapshot-builder/render.ts — buildRenderSnapshot orchestrator.
 *
 * Assembles the complete per-tick RenderSnapshot by calling the sub-modules.
 */

import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import type { DayClockSystem } from "../systems/day-clock";
import type { MeetIndicatorSystem } from "../systems/meet-indicator";
import type { EventFeedSystem } from "../systems/event-feed";
import type { RunHistoryRow } from "../systems/run-history";
import type { RivalrySystem } from "../systems/rivalry";
import type {
  RenderSnapshot,
  SnapshotShock,
} from "../snapshot";
import { leaderboard } from "../sim-bootstrap";
import { seasonForDay } from "../protocols";
import { summarizeRun } from "../run-recap";

import { buildSprites, buildPlayerHotbar } from "./sprites";
import { buildMeets, buildEvents } from "./events";
import { buildObserverSnapshot, countEntities } from "./observer";
import {
  buildLeaderboardRows,
  buildFinalStandings,
  buildRelationshipsData,
  buildRivalriesData,
  buildWealthSeries,
} from "./panels";

/**
 * Build a complete RenderSnapshot for the current tick.
 *
 * @param pendingShock  A shock body captured by the bus subscriber this tick
 *                      (or null if none fired).
 * @param runHistoryRows  Per-day rank/gold rows from RunHistorySystem.history().
 *                        Used to build the RunRecap at game-over. Pass an empty
 *                        array (or omit via the default) for non-game-over ticks.
 * @param rivalrySystem  The RivalrySystem instance (brief 37). Optional for
 *                       back-compat with existing tests.
 */
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
): RenderSnapshot {
  const day = dayClock.day;
  const gameOver = day >= maxDays;

  const sprites = buildSprites(world, tick, day);
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

  // Build the rivalry data for this tick.
  const rivalries = buildRivalriesData(rivalrySystem);
  const relationships = buildRelationshipsData(world);

  // Build the recap once at game-over from the full run history + events.
  // summarizeRun is a pure function: same inputs → identical recap.
  const recap = gameOver && finalSummary !== null
    ? summarizeRun(runHistoryRows, eventFeed.recent(), finalSummary, rivalries)
    : null;
  const playerHotbar = buildPlayerHotbar(world);

  // brief 45 — current weather + season for the render-only rain/snow overlay.
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

  // Build the per-farmer wealth time series for the live graph panel (brief 39).
  // Cheap: grouping ≤500 rows per tick. The series is always present (empty array
  // before day 1) so the panel doesn't need a null-check.
  const wealthSeries = buildWealthSeries(world, runHistoryRows);

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
    relationships,
    rivalries,
    wealthSeries,
    weather,
    festival,
  };
}
