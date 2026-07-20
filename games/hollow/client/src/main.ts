/**
 * Hollow — browser entry point (chunk hollow-09a, extended by hollow-09c,
 * hollow-10b, and hollow-11b).
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
 * Chunk hollow-10b adds the research-instrument UI — a fixed-position LEFT
 * rail (`#hollow-left-rail`) stacking the live chronicle (`chronicle-panel.ts`),
 * live metrics dashboard (`dashboard-panel.ts`), and export buttons
 * (`export-panel.ts`) as DOM overlays alongside (never wrapping) the
 * `#scene` canvas — the canvas keeps filling the FULL viewport exactly as
 * before, so `app.ts`'s `ResizeObserver` is untouched. A chronicle row click
 * jumps the camera via `handleChronicleClick` below (selection + a
 * dead-actor-safe follow, distinct from `handleAgentClicked`'s canvas-pick
 * path, which deliberately never auto-follows).
 *
 * ── chunk hollow-11b: director role ─────────────────────────────────────
 * Boot flow, in order:
 *   1. If `location.hash` decodes as a `RunDescriptor` (`run-descriptor.ts`
 *      — a prior "Share"), skip authoring entirely and `startRun` straight
 *      from its `{seed, persona, interventionLog}` (`replayLog`) — the town
 *      replays byte-identically (hollow-11a's `loadInterventionLog`
 *      contract).
 *   2. Otherwise, mount `persona-setup-panel.ts`'s full-viewport authoring
 *      overlay; its "Start" button hands back a built `PersonaSeed`
 *      (`persona-form.ts`'s pure `buildPersonaSeed`), which becomes this
 *      run's seed+persona (no replay log — a fresh run).
 * `startRun` posts the worker's `"init"` and mounts EVERYTHING the pre-11b
 * app did, PLUS a top director bar (`time-control-panel.ts` +
 * `shock-panel.ts`) and a "Share" button that reads the worker's current
 * `interventionLog` (`"requestInterventions"`/`"interventions"` round trip,
 * mirroring `"requestLineage"`'s) and encodes `{seed, persona,
 * interventionLog}` into `location.hash` (+ clipboard, best-effort).
 *
 * Sim/render boundary (CLAUDE.md): this file, like `app.ts`, only reads
 * `HollowSnapshot`s off `worker`'s `message` events and the render clock —
 * nothing here ever mutates sim state; the `"inspect"`/`"requestLineage"`/
 * `"requestInterventions"` requests are READ-ONLY queries, and time
 * controls/shocks only ever go through the worker's own documented,
 * pacing-only / tick-boundary-applied handlers (see
 * `worker/sim-worker.ts`'s header).
 */
import "./style.css";
import type { HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import type { LineageEntry } from "@hollow/sim-core/lineage";
import type { PersonaSeed } from "@hollow/sim-core/persona";
import type { Intervention } from "@hollow/sim-core/protocols";
import type {
  WorkerInitMessage,
  WorkerInspectMessage,
  WorkerRequestLineageMessage,
  WorkerSetPausedMessage,
  WorkerSetSpeedMessage,
  WorkerStepMessage,
  WorkerShockMessage,
  WorkerRequestInterventionsMessage,
  WorkerOutbound,
} from "./worker/sim-worker";
import { startHollowApp } from "./render3d/app";
import { DebugOverlay } from "@engine/core";
import { HOLLOW_PAL } from "./render/hollow-palette";
import { createOverlayCanvas, resizeOverlayCanvas, drawAgentOverlay, type OverlayAgentInput } from "./render3d/overlay";
import { renderInspectPanel, type InspectPanelCallbacks } from "./inspect-panel";
import type { InspectDetail } from "./inspect-detail";
import { ingestEvents, ingestMetricsRow } from "./research-store";
import { createChroniclePanel } from "./chronicle-panel";
import { createDashboardPanel } from "./dashboard-panel";
import { createExportPanel } from "./export-panel";
import { renderPersonaSetupPanel } from "./persona-setup-panel";
import { DEFAULT_PERSONA_SEED_VALUE } from "./persona-form";
import { createTimeControlPanel } from "./time-control-panel";
import { createShockPanel } from "./shock-panel";
import { encodeRunDescriptor, decodeRunDescriptor, type RunDescriptor } from "./run-descriptor";

// hollow-14a: bumped from 20 to 200 so a day has room for the
// commute/work/gather/sleep phases (`@hollow/sim-core/world`'s `dayPhase`) —
// a life is now ~45 in-game days rather than ~450. Life constants
// (family/constants.ts) are RAW ticks, independent of ticksPerDay, so this
// is a display/legibility change only: it does NOT retune population pace.
const TICKS_PER_DAY = 200;

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
// Chunk hollow-11b: decode a shareable run descriptor from `location.hash`,
// if one is present. Returns `null` (never throws) for an empty hash or a
// malformed one — either way, the caller falls back to the authoring screen.
// ---------------------------------------------------------------------------
function decodeHashDescriptor(): RunDescriptor | null {
  const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  if (!raw) return null;
  try {
    return decodeRunDescriptor(raw);
  } catch {
    return null;
  }
}

/**
 * Boots the whole app for one run — worker init, the 3D scene, the
 * hollow-10b research rail, and the hollow-11b director bar. Called exactly
 * once per page load, either straight from a decoded hash descriptor or
 * after the authoring screen's "Start" (see this file's header).
 */
function startRun(input: { seed: number; persona?: PersonaSeed; replayLog?: Intervention[] }): void {
  const currentSeed = input.seed;
  const currentPersona: PersonaSeed = input.persona ?? {};

  const init: WorkerInitMessage = {
    type: "init",
    seed: input.seed,
    ticksPerDay: TICKS_PER_DAY,
    ...(input.persona ? { persona: input.persona } : {}),
    ...(input.replayLog ? { replayLog: input.replayLog } : {}),
  };
  worker.postMessage(init);

  // -------------------------------------------------------------------------
  // Selection / follow / tag-mode state — plain client-side UI state, never
  // fed into the sim (see this file's header).
  // -------------------------------------------------------------------------

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

  /**
   * Chunk hollow-10b: a chronicle-row click's camera jump. Distinct from
   * `handleAgentClicked` (the canvas ray-pick callback, which never
   * auto-follows — follow-cam there is only ever an explicit `F`/panel-button
   * toggle) — a chronicle click is a request to GO SEE this agent, so it
   * engages follow-cam immediately, unless the agent is no longer alive this
   * frame (`getAgentRenderState()` won't have it — e.g. clicking a decades-old
   * death event), in which case selection still resolves (the "inspect" round
   * trip falls back to the permanent lineage record for a dead agent — see
   * `worker/inspect.ts`'s header) but there's nothing live to follow.
   */
  function handleChronicleClick(agentId: number): void {
    if (followingAgentId !== null) {
      followingAgentId = null;
      app.setFollow(null);
    }
    selectedAgentId = agentId;
    currentDetail = null;
    app.setSelectedAgent(agentId);
    const inspect: WorkerInspectMessage = { type: "inspect", agentId };
    worker.postMessage(inspect);

    const renderState = app.getAgentRenderState();
    if (renderState !== null && renderState.has(agentId)) {
      followingAgentId = agentId;
      app.setFollow(agentId);
    }
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

  /**
   * Shows a centered, palette-styled message over the scene when the WebGPU
   * renderer can't start (see `app.ts`'s `onRendererUnavailable`) — so the
   * user sees an explanation instead of a blank canvas, while the sim +
   * chronicle + dashboard keep running behind it. Idempotent.
   */
  function showRendererUnavailable(message: string): void {
    if (document.getElementById("hollow-renderer-unavailable")) return;
    const box = document.createElement("div");
    box.id = "hollow-renderer-unavailable";
    box.textContent = message;
    box.style.position = "fixed";
    box.style.top = "50%";
    box.style.left = "50%";
    box.style.transform = "translate(-50%, -50%)";
    box.style.maxWidth = "32rem";
    box.style.padding = "16px 20px";
    box.style.textAlign = "center";
    box.style.font = "14px/1.5 ui-monospace, monospace";
    box.style.color = HOLLOW_PAL.cream;
    box.style.background = HOLLOW_PAL.ink;
    box.style.border = `1px solid ${HOLLOW_PAL.rust}`;
    box.style.borderRadius = "6px";
    box.style.zIndex = "50";
    box.style.pointerEvents = "none";
    appEl.appendChild(box);
  }

  // -------------------------------------------------------------------------
  // Boot the 3D app
  // -------------------------------------------------------------------------

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
    onRendererUnavailable: showRendererUnavailable,
  });

  // Chunk hollow-10b: the `"requestLineage"`/`"lineage"` round trip backing
  // the export panel's `lineage.json` button (see `worker/sim-worker.ts`'s
  // header). At most one request is ever in flight per click, but a FIFO
  // queue costs nothing and tolerates a future double-click without
  // misattributing a reply.
  const pendingLineageResolvers: ((entries: LineageEntry[]) => void)[] = [];
  function requestLineage(): Promise<LineageEntry[]> {
    return new Promise((resolve) => {
      pendingLineageResolvers.push(resolve);
      const req: WorkerRequestLineageMessage = { type: "requestLineage" };
      worker.postMessage(req);
    });
  }

  // Chunk hollow-11b: the `"requestInterventions"`/`"interventions"` round
  // trip backing the "Share" button — same FIFO-queue pattern as
  // `requestLineage` above.
  const pendingInterventionResolvers: ((log: Intervention[]) => void)[] = [];
  function requestInterventions(): Promise<Intervention[]> {
    return new Promise((resolve) => {
      pendingInterventionResolvers.push(resolve);
      const req: WorkerRequestInterventionsMessage = { type: "requestInterventions" };
      worker.postMessage(req);
    });
  }

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
      // `research-store.ts`; rendered live by `chronicle-panel.ts` (chunk
      // hollow-10b, mounted below).
      ingestEvents(msg.events);
    } else if (msg.type === "metrics") {
      // Per-year metrics sample (chunk hollow-10a) — same store, rendered
      // live by `dashboard-panel.ts` (chunk hollow-10b, mounted below).
      ingestMetricsRow(msg.row);
    } else if (msg.type === "lineage") {
      pendingLineageResolvers.shift()?.(msg.entries);
    } else if (msg.type === "interventions") {
      // Chunk hollow-11b: posted both spontaneously (right after init, and
      // after every live "shock") and in reply to an explicit
      // "requestInterventions" — a resolver is only present for the latter,
      // so `.shift()` on an empty queue (the spontaneous case) is a no-op.
      pendingInterventionResolvers.shift()?.(msg.log);
    }
  });

  // -------------------------------------------------------------------------
  // Research-instrument UI (chunk hollow-10b) — a fixed-position left rail
  // stacking the live chronicle, live metrics dashboard, and export buttons as
  // DOM overlays. Purely additive: the `#scene` canvas's own size/resize
  // handling (`app.ts`) is untouched — see this file's header.
  // -------------------------------------------------------------------------

  const leftRail = document.createElement("div");
  leftRail.id = "hollow-left-rail";

  const chronicle = createChroniclePanel({ ticksPerDay: TICKS_PER_DAY, onSelectAgent: handleChronicleClick });
  const dashboard = createDashboardPanel();
  const exportPanel = createExportPanel({ requestLineage });

  leftRail.appendChild(chronicle.el);
  leftRail.appendChild(dashboard.el);
  leftRail.appendChild(exportPanel);
  appEl.appendChild(leftRail);

  // -------------------------------------------------------------------------
  // Chunk hollow-11b: director bar — time controls, shocks, share. A
  // fixed-position top-right overlay, same "DOM overlay beside the canvas"
  // convention as the left rail above.
  // -------------------------------------------------------------------------

  const directorBar = document.createElement("div");
  directorBar.id = "hollow-director-bar";

  const timeControl = createTimeControlPanel({
    onSetPaused: (paused) => worker.postMessage({ type: "setPaused", paused } satisfies WorkerSetPausedMessage),
    onSetSpeed: (multiplier) => worker.postMessage({ type: "setSpeed", multiplier } satisfies WorkerSetSpeedMessage),
    onStep: () => worker.postMessage({ type: "step" } satisfies WorkerStepMessage),
  });

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "hollow-share-button";
  shareBtn.textContent = "Share";
  shareBtn.style.color = HOLLOW_PAL.ink;
  shareBtn.style.background = HOLLOW_PAL.cyan;
  shareBtn.addEventListener("click", () => {
    void (async () => {
      const log = await requestInterventions();
      const descriptor: RunDescriptor = { seed: currentSeed, persona: currentPersona, interventionLog: log };
      const encoded = encodeRunDescriptor(descriptor);
      location.hash = encoded;
      try {
        await navigator.clipboard.writeText(location.href);
      } catch {
        // Clipboard permission denied/unavailable — `location.hash` is
        // already set, so the address bar itself is shareable; nothing
        // further to do.
      }
    })();
  });

  const shockPanel = createShockPanel({
    onFireShock: (shock) => worker.postMessage({ type: "shock", shock } satisfies WorkerShockMessage),
  });

  const timeRow = document.createElement("div");
  timeRow.className = "hollow-director-bar-row";
  timeRow.appendChild(timeControl.el);
  timeRow.appendChild(shareBtn);

  directorBar.appendChild(timeRow);
  directorBar.appendChild(shockPanel);
  appEl.appendChild(directorBar);

  // -------------------------------------------------------------------------
  // `[T]` tag toggle / `F` follow toggle
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Perf HUD (fps / ms / tick / agent-count + scene-frame mean·p95) — the
  // engine's generic `DebugOverlay`, same one Farm Valley uses. Pinned
  // bottom-right (top-left is the chronicle rail, top-right the director
  // bar). Backtick (`) toggles it. `update()` is called once per overlay rAF
  // below, so its fps/ms track the real display-frame cadence; the scene's
  // own build+submit CPU cost comes from `app.getRenderReport()`.
  // -------------------------------------------------------------------------
  const debugOverlay = new DebugOverlay(appEl, { corner: "bottom-right" });
  let showPerfHud = true;

  window.addEventListener("keydown", (e) => {
    if (e.key === "t" || e.key === "T") {
      showTags = !showTags;
    } else if (e.key === "f" || e.key === "F") {
      toggleFollow();
    } else if (e.key === "`") {
      showPerfHud = !showPerfHud;
      debugOverlay.setVisible(showPerfHud);
    }
  });

  // -------------------------------------------------------------------------
  // Glyph/tag overlay — own rAF loop (see this file's header for why: it
  // needs `latestSnapshot`'s `action`/`needs`/`starving`, which aren't on
  // `AgentRenderState`).
  // -------------------------------------------------------------------------

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
    // Perf HUD — updated every display frame (its fps/ms come from the
    // wall-clock delta between these calls). Runs even before the first
    // snapshot / when WebGPU is absent, so it's always a live readout.
    if (showPerfHud) {
      const frameReport = app.getRenderReport();
      if (frameReport) debugOverlay.setFrameReport(frameReport);
      debugOverlay.update({
        tick: latestSnapshot?.tick ?? 0,
        alpha: 0,
        entityCount: latestSnapshot?.agents.length ?? 0,
      });
    }

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
}

// ---------------------------------------------------------------------------
// Chunk hollow-11b: boot flow — a shared-hash replay skips authoring
// entirely; otherwise mount the authoring screen and wait for "Start".
// ---------------------------------------------------------------------------

const hashDescriptor = decodeHashDescriptor();
if (hashDescriptor) {
  startRun({
    seed: hashDescriptor.seed,
    persona: hashDescriptor.persona,
    replayLog: [...hashDescriptor.interventionLog],
  });
} else {
  const setupEl = renderPersonaSetupPanel({
    onStart: (seed) => {
      setupEl.remove();
      startRun({ seed: seed.seed ?? DEFAULT_PERSONA_SEED_VALUE, persona: seed });
    },
  });
  appEl.appendChild(setupEl);
}
