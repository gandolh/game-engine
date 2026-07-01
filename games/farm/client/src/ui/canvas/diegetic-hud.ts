/**
 * Farm Valley diegetic HUD — in-world signage panels rendered IN-CANVAS via `@engine/ui`.
 *
 * The reinvention half of "render all Farm UI in-canvas" (todo decision #7: "observer data =
 * hybrid diegetic + summon"): rather than only living in fixed screen-corner boxes, key readouts
 * get an in-world HOME attached to a physical structure the world already spawns —
 *  - the **notice-board** (`structure/notice-board` at `NOTICE_BOARD_TILE`) shows the latest events,
 *  - the **standings post** (the auction podium at `AUCTION_PODIUM_TILE`) shows the day/time + the
 *    current top-3 standings.
 * The host anchors each panel over its structure every frame (world → canvas CSS px via
 * `worldToCanvasCss`) so they track as the camera pans, and can also SUMMON them to screen-centre
 * on a key press (the render loop draws them centred instead of world-anchored while summoned).
 *
 * These are compact READOUTS — the full observer panel / leaderboard remain for detail. No new sim
 * state: data comes from the existing event feed + leaderboard snapshots (decision #8).
 *
 * EDG32-only: every colour is an `EDG.*` constant.
 */
import { EDG } from "@engine/core";
import { box, label, panel } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";
import type { EventFeedRow } from "./event-feed";
import type { LeaderboardRow } from "./leaderboard";

/** How many recent events / top standings the compact diegetic readouts show. */
const NOTICE_LINES = 4;
const STANDINGS_LINES = 3;

export interface NoticeBoardState {
  events: readonly EventFeedRow[];
}
export interface StandingsPostState {
  day: number;
  timeLabel: string;
  rows: readonly LeaderboardRow[];
}

/** A retained diegetic readout: its root plus refresh(). */
interface DiegeticPanel<S> {
  readonly root: ContainerNode;
  refresh(state: S): boolean;
}

export interface NoticeBoard extends DiegeticPanel<NoticeBoardState> {}
export interface StandingsPost extends DiegeticPanel<StandingsPostState> {}

function setText(lbl: LabelNode, text: string): boolean {
  if (lbl.text === text) return false;
  lbl.text = text;
  return true;
}

/** Build the notice-board readout: a titled card listing the most recent events (newest first). */
export function createNoticeBoard(): NoticeBoard {
  const title = label("Notice Board", { color: EDG.tan });
  const lines: LabelNode[] = [];
  for (let i = 0; i < NOTICE_LINES; i++) lines.push(label("", { color: EDG.cream }));
  const root = panel({ direction: "column", gap: 2, align: "start", padding: 6 }, [title, ...lines]);

  let changed = false;
  let firstRefresh = true;

  function refresh(state: NoticeBoardState): boolean {
    changed = false;
    // Newest first, matching the event feed's own ordering.
    const recent = state.events.slice(-NOTICE_LINES).reverse();
    for (let i = 0; i < NOTICE_LINES; i++) {
      const row = recent[i];
      const text = row !== undefined ? `Day ${row.day}: ${row.text}` : "";
      const high = row !== undefined && (row.drama ?? 0) >= 0.7;
      if (setText(lines[i]!, text)) changed = true;
      const wantColor = high ? EDG.gold : EDG.cream;
      if (lines[i]!.color !== wantColor) lines[i]!.color = wantColor;
    }
    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}

/** Build the standings post readout: day/time header + the current top-3 by total value. */
export function createStandingsPost(): StandingsPost {
  const header = label("", { color: EDG.silver });
  const rows: LabelNode[] = [];
  for (let i = 0; i < STANDINGS_LINES; i++) rows.push(label("", { color: EDG.cream }));
  const root = panel({ direction: "column", gap: 2, align: "start", padding: 6 }, [
    label("Standings", { color: EDG.tan }),
    header,
    ...rows,
  ]);

  const RANK_COLOR = [EDG.gold, EDG.silver, EDG.clay] as const;

  let changed = false;
  let firstRefresh = true;

  function refresh(state: StandingsPostState): boolean {
    changed = false;
    if (setText(header, `Day ${state.day}  ${state.timeLabel}`)) changed = true;
    for (let i = 0; i < STANDINGS_LINES; i++) {
      const row = state.rows[i];
      const text = row !== undefined ? `${i + 1}. ${row.name}  ${row.totalValue}g` : "";
      if (setText(rows[i]!, text)) changed = true;
      const wantColor = RANK_COLOR[i] ?? EDG.cream;
      if (rows[i]!.color !== wantColor) rows[i]!.color = wantColor;
    }
    const result = changed || firstRefresh;
    firstRefresh = false;
    return result;
  }

  return { root, refresh };
}
