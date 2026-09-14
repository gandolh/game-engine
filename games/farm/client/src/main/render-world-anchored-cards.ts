/**
 * World-anchored UI cards for the Farm render loop (audit-25 slice 3/4): the followed-farmer
 * inspect card, the diegetic HUD (notice-board + standings-post), and the Pip's-farm marker — the
 * three panels that track a *world* position (via `worldToCanvasCss`) each frame, in the same
 * `@engine/ui` surface as every other panel.
 *
 * Must run inside the same `surface.begin()`/`surface.end()` bracket as the rest of the UI panels
 * (`render-ui-panels.ts`), at the same point in the sequence the original inline block held: after
 * the hover tooltip, before the help modal. Split out verbatim — same refresh/computeLayout/
 * renderTree calls, same order, just given explicit parameters instead of closing over
 * `renderFrame`'s locals.
 */
import type { Camera2D } from "@engine/core";
import { MAX_ZOOM } from "@engine/core";
import { computeLayout, renderTree } from "@engine/ui";
import type { UISurface } from "@engine/ui";
import { NOTICE_BOARD_TILE, AUCTION_PODIUM_TILE } from "@farm/sim-core/world/regions";
import { dayFraction } from "@farm/sim-core/systems/day-phase";
import { fractionToTimeLabel } from "../ui/canvas/world-clock";
import { TILE, DEFAULT_ZOOM } from "./config";
import { worldToCanvasCss } from "./screen-to-tile";
import type { InspectPanel } from "../ui/canvas/inspect-panel";
import type { NoticeBoard, StandingsPost } from "../ui/canvas/diegetic-hud";
import type { UIRootHandle } from "../ui/canvas/ui-host";
import type { PipFarmMarker } from "./pip-farm-marker";
import type { SimClient } from "../net/sim-client";

export interface WorldAnchoredCardsParams {
  surface: UISurface;
  canvas: HTMLCanvasElement;
  camera: Camera2D | null;
  zoom: number;
  nowMs: number;
  ticksPerDay: number;
  hudSummoned: boolean;
  focusedFarmerId: number | null;
  farmerPositions: ReadonlyMap<number, { x: number; y: number }>;
  client: SimClient;
  inspectPanel: InspectPanel;
  inspectRoot: UIRootHandle;
  inspectCtl: InspectPanel & { setVisible(v: boolean): void };
  noticeBoard: NoticeBoard;
  noticeBoardRoot: UIRootHandle;
  standingsPost: StandingsPost;
  standingsPostRoot: UIRootHandle;
  pipMarker: PipFarmMarker;
}

/**
 * The followed-farmer inspect card: floats above the followed farmer's head, scaled with zoom,
 * visible only near max zoom-in (within 5% of `MAX_ZOOM`).
 */
function renderInspectCard(p: WorldAnchoredCardsParams): void {
  const { surface, canvas, camera, zoom, focusedFarmerId, farmerPositions, client, inspectPanel, inspectRoot, inspectCtl } = p;
  const obsData = client.observer;
  const followed = focusedFarmerId !== null ? farmerPositions.get(focusedFarmerId) : undefined;
  const farmerRow = obsData?.farmers.find((f) => f.id === focusedFarmerId);
  // The floating inspect card only reads well when the subject sprite is large, so show it
  // ONLY near the max zoom-in (within 5% of MAX_ZOOM); at any wider zoom it's hidden. Below
  // that threshold the farmer detail still lives in the (openable) Farmers panel.
  const nearMaxZoom = zoom >= MAX_ZOOM * 0.95;
  if (camera !== null && followed !== undefined && farmerRow !== undefined && nearMaxZoom) {
    inspectCtl.setVisible(true);
    const changed = inspectPanel.refresh({
      name: farmerRow.name,
      personality: farmerRow.personality,
      gold: farmerRow.gold,
      fsm: farmerRow.fsm,
      apCurrent: farmerRow.apCurrent,
      apMax: farmerRow.apMax,
      region: farmerRow.region,
      currentIntention: farmerRow.currentIntention,
    });
    // Scale the card with the camera zoom so it stays proportional to its subject sprite —
    // a fixed screen-size card dwarfs a tiny zoomed-out farmer and reads as detached (the
    // "inspect card too big / offset" report). `k = 1` at the default zoom; clamped to a
    // legibility floor and a not-gigantic ceiling.
    const k = Math.max(0.6, Math.min(1.2, 0.85 * (zoom / DEFAULT_ZOOM)));
    inspectPanel.setScale(k);
    // Anchor above the farmer's head: measure, then place centred over the subject. The
    // vertical gap is expressed in WORLD units (converted through the SAME worldToCanvasCss
    // as the anchor), so the card hugs the sprite's head at every zoom instead of floating a
    // fixed pixel gap that detaches when zoomed out.
    computeLayout(inspectPanel.root, 0, 0);
    const headAnchor = worldToCanvasCss(camera, canvas, followed.x, followed.y - TILE * 1.3);
    const ax = headAnchor.x - inspectPanel.root.rect.width / 2;
    const ay = headAnchor.y - inspectPanel.root.rect.height;
    computeLayout(inspectPanel.root, ax, ay);
    if (changed) inspectRoot.mirror?.update(inspectPanel.root);
    renderTree(surface, inspectPanel.root);
  } else {
    inspectCtl.setVisible(false);
  }
}

/**
 * The diegetic HUD: the notice-board (events) + standings-post (day/time + top-3) — normally
 * anchored over their in-world structures, or stacked screen-centred while `hudSummoned` (the J
 * toggle).
 */
function renderDiegeticHud(p: WorldAnchoredCardsParams): void {
  const { surface, canvas, camera, ticksPerDay, hudSummoned, client, noticeBoard, noticeBoardRoot, standingsPost, standingsPostRoot } = p;
  const noticeChanged = noticeBoard.refresh({ events: client.events });
  const timeLabel = fractionToTimeLabel(dayFraction(client.tick, ticksPerDay));
  const standingsChanged = standingsPost.refresh({
    day: client.day,
    timeLabel,
    rows: client.leaderboard,
  });

  if (hudSummoned) {
    // Summoned: stack both centred (measure → re-anchor), notice-board above standings.
    computeLayout(noticeBoard.root, 0, 0);
    computeLayout(standingsPost.root, 0, 0);
    const totalH = noticeBoard.root.rect.height + standingsPost.root.rect.height + 8;
    const topY = Math.max(0, (canvas.clientHeight - totalH) / 2);
    const nx = Math.max(0, (canvas.clientWidth - noticeBoard.root.rect.width) / 2);
    computeLayout(noticeBoard.root, nx, topY);
    const sx = Math.max(0, (canvas.clientWidth - standingsPost.root.rect.width) / 2);
    computeLayout(standingsPost.root, sx, topY + noticeBoard.root.rect.height + 8);
  } else if (camera !== null) {
    // World-anchored: float each panel above its structure's tile centre.
    computeLayout(noticeBoard.root, 0, 0);
    const nb = worldToCanvasCss(
      camera, canvas,
      NOTICE_BOARD_TILE.x * TILE + TILE / 2, NOTICE_BOARD_TILE.y * TILE,
    );
    computeLayout(noticeBoard.root, nb.x - noticeBoard.root.rect.width / 2, nb.y - noticeBoard.root.rect.height - TILE);
    computeLayout(standingsPost.root, 0, 0);
    const sp = worldToCanvasCss(
      camera, canvas,
      AUCTION_PODIUM_TILE.x * TILE + TILE / 2, AUCTION_PODIUM_TILE.y * TILE,
    );
    computeLayout(standingsPost.root, sp.x - standingsPost.root.rect.width / 2, sp.y - standingsPost.root.rect.height - TILE);
  }
  if (noticeChanged) noticeBoardRoot.mirror?.update(noticeBoard.root);
  if (standingsChanged) standingsPostRoot.mirror?.update(standingsPost.root);
  renderTree(surface, noticeBoard.root);
  renderTree(surface, standingsPost.root);
}

/**
 * Pip's-farm marker — a screen-space pin above Pip's home plot, shown only once the camera is
 * zoomed out enough that the 21 farms are otherwise indistinguishable.
 */
function renderPipFarmMarker(p: WorldAnchoredCardsParams): void {
  const { surface, canvas, camera, zoom, nowMs, pipMarker } = p;
  if (camera !== null) {
    pipMarker.setFrame(camera, canvas, zoom, nowMs);
    computeLayout(pipMarker.root, 0, 0);
    renderTree(surface, pipMarker.root);
  }
}

/** Render all three world-anchored cards, in the original sequence: inspect card, diegetic HUD,
 *  Pip's-farm marker. Call from within the panels' `surface.begin()`/`end()` bracket, after the
 *  hover tooltip and before the help modal. */
export function renderWorldAnchoredCards(p: WorldAnchoredCardsParams): void {
  renderInspectCard(p);
  renderDiegeticHud(p);
  renderPipFarmMarker(p);
}
