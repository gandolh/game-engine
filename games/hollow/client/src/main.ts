/**
 * Hollow — browser entry point (chunk hollow-09a, extended by hollow-09c).
 *
 * Boots the sim worker and the cozy 3D town app shell (`render3d/app.ts`)
 * against the `#scene` canvas, then wires chunk hollow-09c's legibility +
 * interaction layer on top:
 *  - the glyph/`[T]`-tag 2D overlay (`render3d/overlay.ts`), drawn in this
 *    file's OWN rAF loop from `app.getAgentRenderState()`/`getViewProj()`
 *    (the seam `app.ts` publishes) plus this file's own snapshot listener
 *    (for the `action`/`needs`/`starving` fields `AgentRenderState` doesn't
 *    carry);
 *  - click-to-inspect: `app.ts`'s `onAgentClicked` callback fires the
 *    worker's `"inspect"` round trip; the resolved `InspectDetail` renders
 *    into the side panel (`inspect-panel.ts`);
 *  - `T` toggles tags, `F` toggles follow-cam for the current selection.
 *
 * Sim/render boundary (CLAUDE.md): this file, like `app.ts`, only reads
 * `HollowSnapshot`s off `worker`'s `message` events and the render clock —
 * nothing here ever mutates sim state; the `"inspect"` request is a
 * READ-ONLY query (see `worker/inspect.ts`'s header).
 */
import "./style.css";
import type { HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import type { WorkerInitMessage, WorkerInspectMessage, WorkerOutbound } from "./worker/sim-worker";
import { startHollowApp } from "./render3d/app";
import { HOLLOW_PAL } from "./render/hollow-palette";
import { createOverlayCanvas, resizeOverlayCanvas, drawAgentOverlay, type OverlayAgentInput } from "./render3d/overlay";
import { renderInspectPanel, type InspectPanelCallbacks } from "./inspect-panel";
import type { InspectDetail } from "./inspect-detail";
import { ingestEvents, ingestMetricsRow } from "./research-store";

// Deterministic seed — every sim entry point threads one through from the
// start (determinism is load-bearing; see CLAUDE.md), even though nothing
// here reads it beyond passing it to the worker.
const SEED = 0x1a1100;
const TICKS_PER_DAY = 20;

const appElRaw = document.getElementById("app");
if (!(appElRaw instanceof HTMLElement)) {
  throw new Error("hollow: #app container missing from index.html");
}
const canvasRaw = document.getElementById("scene");
if (!(canvasRaw instanceof HTMLCanvasElement)) {
  throw new Error("hollow: #scene canvas missing from index.html");
}
// Re-bound to concretely-typed consts: control-flow narrowing from the
// `instanceof` guards above does not survive into the closures below (they
// could in principle run before this line, so TS conservatively widens
// back to nullable) — same precedent as `render3d-demo.ts`'s `canvas`
// re-binding.
const appEl: HTMLElement = appElRaw;
const canvas: HTMLCanvasElement = canvasRaw;

// Palette-sourced page chrome (CSS can't import HOLLOW_PAL — see
// style.css's header; setting these from TS instead of a CSS hex literal
// keeps every color on the palette-purity contract, CLAUDE.md).
document.body.style.background = HOLLOW_PAL.black;
document.body.style.color = HOLLOW_PAL.white;

const worker = new Worker(new URL("./worker/sim-worker", import.meta.url), { type: "module" });

// ---------------------------------------------------------------------------
// Selection / follow / tag-mode state — plain client-side UI state, never
// fed into the sim (see this file's header).
// ---------------------------------------------------------------------------

let latestSnapshot: HollowSnapshot | null = null;
let selectedAgentId: number | null = null;
let followingAgentId: number | null = null;
let currentDetail: InspectDetail | null = null;
let panelEl: HTMLElement | null = null;
let showTags = false;

function removePanel(): void {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
  }
}

function showPanel(detail: InspectDetail): void {
  currentDetail = detail;
  removePanel();
  const callbacks: InspectPanelCallbacks = {
    onClose: closeSelection,
    onToggleFollow: toggleFollow,
    isFollowing: followingAgentId === detail.id,
  };
  panelEl = renderInspectPanel(detail, callbacks);
  appEl.appendChild(panelEl);
}

function closeSelection(): void {
  selectedAgentId = null;
  followingAgentId = null;
  currentDetail = null;
  app.setSelectedAgent(null);
  app.setFollow(null);
  removePanel();
}

function toggleFollow(): void {
  if (selectedAgentId === null) return;
  if (followingAgentId === selectedAgentId) {
    followingAgentId = null;
    app.setFollow(null);
  } else {
    followingAgentId = selectedAgentId;
    app.setFollow(selectedAgentId);
  }
  if (currentDetail) showPanel(currentDetail); // re-render for the button's label/state
}

function handleAgentClicked(agentId: number | null): void {
  // Any new click — a different agent, or empty space — cancels an active
  // follow (see `render3d/app.ts`'s `setFollow` doc: an explicit re-press of
  // `F` resumes it for the new selection instead of silently snapping the
  // camera to whatever was just clicked).
  if (followingAgentId !== null) {
    followingAgentId = null;
    app.setFollow(null);
  }
  selectedAgentId = agentId;
  currentDetail = null;
  if (agentId === null) {
    removePanel();
    return;
  }
  const inspect: WorkerInspectMessage = { type: "inspect", agentId };
  worker.postMessage(inspect);
}

// ---------------------------------------------------------------------------
// Boot the 3D app
// ---------------------------------------------------------------------------

// Kept alive for the page's lifetime — a fresh page load owns the whole
// app/worker pair, so nothing calls `.dispose()` today. It exists on
// `HollowApp` for a future dev-hot-reload teardown hook (and so tests/tools
// that DO want to tear an instance down have something to call).
const app = startHollowApp(canvas, worker, {
  ticksPerDay: TICKS_PER_DAY,
  onAgentClicked: handleAgentClicked,
  onFollowCancelled: () => {
    followingAgentId = null;
    if (currentDetail) showPanel(currentDetail);
  },
});

const init: WorkerInitMessage = { type: "init", seed: SEED, ticksPerDay: TICKS_PER_DAY };
worker.postMessage(init);

worker.addEventListener("message", (event: MessageEvent<WorkerOutbound>) => {
  const msg = event.data;
  if (msg.type === "snapshot") {
    latestSnapshot = msg.snapshot;
  } else if (msg.type === "inspectResult") {
    // Ignore a stale response for a selection the player has since changed
    // (e.g. two clicks in quick succession before the first round trip
    // returns).
    if (msg.agentId !== selectedAgentId) return;
    if (msg.detail) showPanel(msg.detail);
    else removePanel();
  } else if (msg.type === "events") {
    // Research/chronicle feed (chunk hollow-10a) — accumulated into
    // `research-store.ts` for a future chronicle list (chunk hollow-10b);
    // no UI consumes this yet.
    ingestEvents(msg.events);
  } else if (msg.type === "metrics") {
    // Per-year metrics sample (chunk hollow-10a) — same store, future
    // dashboard charts/export buttons are hollow-10b's job.
    ingestMetricsRow(msg.row);
  }
});

// ---------------------------------------------------------------------------
// `[T]` tag toggle / `F` follow toggle
// ---------------------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.key === "t" || e.key === "T") {
    showTags = !showTags;
  } else if (e.key === "f" || e.key === "F") {
    toggleFollow();
  }
});

// ---------------------------------------------------------------------------
// Glyph/tag overlay — own rAF loop (see this file's header for why: it
// needs `latestSnapshot`'s `action`/`needs`/`starving`, which aren't on
// `AgentRenderState`).
// ---------------------------------------------------------------------------

const overlayCanvas = createOverlayCanvas(appEl);
const overlayCtx = overlayCanvas.getContext("2d");
if (!overlayCtx) {
  // eslint-disable-next-line no-console -- surfaced to the dev console, same
  // convention as app.ts's WebGPU-unavailable message; the overlay is a
  // legibility layer on top of the 3D scene, not something the app hard-fails
  // without.
  console.error("[hollow] 2D overlay canvas context unavailable — glyphs/tags will not render.");
}

function overlayFrame(): void {
  if (overlayCtx) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    resizeOverlayCanvas(overlayCanvas, rect.width, rect.height, dpr);
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const renderState = app.getAgentRenderState();
    const viewProj = app.getViewProj();
    if (renderState && viewProj && latestSnapshot) {
      const agents: OverlayAgentInput[] = [];
      for (const agent of latestSnapshot.agents) {
        const state = renderState.get(agent.id);
        if (!state) continue; // despawned since this snapshot, or not yet rendered
        agents.push({
          id: agent.id,
          headWorld: state.headWorld,
          action: agent.action,
          needs: agent.needs,
          starving: agent.starving,
        });
      }
      drawAgentOverlay(overlayCtx, agents, {
        viewProj,
        width: rect.width,
        height: rect.height,
        showTags,
        selectedAgentId,
      });
    } else {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    }
  }
  requestAnimationFrame(overlayFrame);
}
requestAnimationFrame(overlayFrame);
