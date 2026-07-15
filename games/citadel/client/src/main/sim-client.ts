import { MAX_ZOOM } from "@engine/core";
import type {
  BuildingSnapshot,
  VillagerSnapshot,
  RaiderSnapshot,
  SettlementTier,
  RenderSnapshot,
  BarterOffer,
} from "@citadel/sim-core";
import { clampZoom } from "../render/citadel-renderer";
import { followReleaseId } from "../render/citadel-fx";
import { shouldIngestSnapshot } from "../render/entity-interp";
import { newEventsSince } from "../ui/toast";
import { CitadelSimClient } from "../worker/sim-client";
import { CitadelServerClient } from "../worker/server-client";
import { toasts, citadelAudio } from "./hud-wiring";
import { villagerInterp, raiderInterp } from "./fx";
import { followId, setFollowId, villagerMirror } from "./build-controls";
import { camera, iso, inputReady } from "./renderer-state";

// ---------------------------------------------------------------------------
// Sim client — solo runs the sim in an in-browser Worker; `?mp` drives it over
// a WebSocket to the multi-writer @citadel/server (Citadel 35). Both transports
// share one interface, so the rest of the client is transport-agnostic.
// ---------------------------------------------------------------------------
export const useServer = typeof location !== "undefined" && new URLSearchParams(location.search).has("mp");
/** Build cost is charged only in solo (the cozy economy, set in the Worker bootstrap); MP keeps placement free. */
export const CHARGE_BUILD_COST = !useServer;
export const client: CitadelSimClient | CitadelServerClient = useServer
  ? new CitadelServerClient()
  : new CitadelSimClient();

// Citadel 97/13: paused/speed/isHost are now SIM-AUTHORITATIVE — rederived from every snapshot
// (see onSnapshot below), never optimistic shadow state. Keeping a local shadow was the bug: a
// solo load-save left `paused` stuck true, pinning interp alpha to 1 (entities snapped). `isHost`
// greys the room controls for a non-host peer instead of showing a toggle that silently no-ops.
export let paused = false;
export let speed = 1; // current sim-speed multiplier (1/2/4); drives the HUD speed-button highlight
export let isHost = true; // solo is trivially host; MP: only the room host may pause/resume/change speed
export let day = 1;
export let tick = 0;            // render-side mirror of snap.tick (for the day/night wash)
export let season = "spring";
export let tier = "Hamlet"; // Phase 5: settlement tier (current; displayed in HUD)
export let peakTier = "Hamlet"; // highest tier ever reached; gates build/upgrade buttons
export let population = 0;
export let popCap = 0;
export let localPlayerId = 0; // owner id the snapshot is the view of (solo = 0)
// The full stockpile from the latest snapshot (every good → count); feeds the HUD goods strip.
export let stockpiles: Readonly<Record<string, number>> = {};
export let foodSurplus = 0;
export let happiness = 40;
export let events: readonly string[] = [];

// Phase 3 state
export let traderPresent = false;
export let traderOffersList: readonly BarterOffer[] = [];

// Phase 4 state
export let threatLevel = 0;
export let defensiveStrength = 0;
export let keepPresent = false;
export let keepSacked = false;
export let nextRaidDay = -1;
// Phase 4.5 hazard state
export let sickVillagers = 0;
export let outbreakActive = false;
export let activeFires = 0;

// engine-ui chunk 7: pause/speed are now in-canvas @engine/ui buttons. These two
// functions are the single shared command path — invoked by the HUD buttons' onActivate
// (mouse, Tab+Enter via the dispatcher, AND the a11y mirror's <button>). The pause label
// flip + the active-speed highlight are derived from `paused`/`speed` in the HUD's refresh.
export function togglePause(): void {
  // Citadel 97/13: room control is host-only; a non-host command is dropped server-side
  // (and its HUD button renders disabled), so bail early rather than fire a no-op.
  if (!isHost) return;
  if (paused) {
    client.resume();
  } else {
    client.pause();
  }
  // `paused` is rederived from the authoritative snapshot — do NOT flip it optimistically.
}
/** Picking a speed also resumes if paused (standard city-builder behaviour). */
export function setSpeedAndResume(n: number): void {
  if (!isHost) return;
  client.setSpeed(n);
  if (paused) client.resume();
  // `speed`/`paused` are rederived from the authoritative snapshot — no optimistic write.
}

export let latestSnapshot: RenderSnapshot | null = null;
// Phase C opening framing: one-shot, solo-only. The seeded starter town's
// anchor shifts per-seed (seedFoundingTown ring-searches outward from map
// centre to dodge rivers/water), so we can't just point the camera at a fixed
// tile — we wait for the seeded buildings to actually appear in a snapshot,
// average their footprint centers, and frame that. MP has no seeded town (and
// may use a different world), so this stays gated on solo.
export let openingFramed = false;
/** Used by boot.ts's startGame() (challenge mode frames the core box up front instead). */
export function markOpeningFramed(): void {
  openingFramed = true;
}

// Brief 97/20: sequence-based, not string-based — see newEventsSince's doc comment in toast.ts.
let lastSeenEventsSeq: number | null = null;
// Cozy-pivot Phase F (decision #7): latch for the ONE gentle contentment
// banner, edge-triggered on `allHomesCovered` flipping false→true. `null`
// until the first snapshot arrives, so we can initialize the latch from
// whatever state the town loads in WITHOUT toasting (no spurious banner on
// save-load of an already-happy town) — only a later rising edge congratulates.
let prevAllHomesCovered: boolean | null = null;

export let currentBuildings: readonly BuildingSnapshot[] = [];
export let currentVillagers: readonly VillagerSnapshot[] = [];
export let currentRaiders: readonly RaiderSnapshot[] = [];

// Render-only entity position interpolation bookkeeping — read by render-loop.ts's loop() to
// compute the inter-snapshot glide fraction. Only mutated inside the onSnapshot handler below;
// exported read-only.
export let lastSnapshotMs = 0;   // render clock when the latest snapshot arrived
export let snapshotIntervalMs = 0; // measured ms between the last two snapshot arrivals
// Citadel 97/13: the sim tick of the last snapshot actually fed into interpolation
// (null = none yet). Guards against pause/resume/speed-change correction snapshots,
// which re-broadcast the SAME tick outside the normal cadence — see shouldIngestSnapshot.
let lastIngestedTick: number | null = null;

client.onSnapshot((snap) => {
  latestSnapshot = snap;
  tick = snap.tick;
  // Citadel 97/13: pacing + host identity are sim-authoritative — rederive them here (never
  // optimistic local state). `paused` drives the HUD label + interp alpha; `speed` the speed
  // highlight; `isHost` greys the room controls for a non-host peer.
  paused = snap.paused;
  speed = snap.speed;
  isHost = snap.isHost;
  day = snap.day + 1;
  season = snap.season;
  tier = snap.tier;  // Phase 5
  peakTier = snap.peakTier;  // gates build/upgrade buttons (never demotes)
  // The build bar's tier-lock/affordability + active-tool states re-bind each frame in the
  // render loop (buildBar.refresh reads peakTier/stockpiles/placementState) — no call here.
  population = snap.population;
  popCap = snap.popCap;
  stockpiles = snap.stockpiles;
  foodSurplus = snap.foodSurplus;
  events = snap.recentEvents;
  // Toast only the freshly-appended events (the rest is backlog already shown).
  // performance.now() is the render clock — main-thread only, never the sim.
  for (const e of newEventsSince(lastSeenEventsSeq, snap.eventsSeq, events)) {
    toasts.push(e, performance.now());
    citadelAudio.onEvent(e);
  }
  lastSeenEventsSeq = snap.eventsSeq;
  // Cozy-pivot Phase F (decision #7): ONE gentle diegetic banner on the
  // false→true rising edge of `allHomesCovered` — never a nag, never repeats
  // while the state holds. Reset the latch on true→false so a later
  // re-completion is congratulated again. The `=== null` branch only seeds
  // the latch on the very first snapshot; it never toasts (avoids a spurious
  // banner on save-load of an already-happy town).
  if (prevAllHomesCovered === null) {
    prevAllHomesCovered = snap.allHomesCovered;
  } else if (snap.allHomesCovered && !prevAllHomesCovered) {
    toasts.push("Every home is prospering.", performance.now());
    prevAllHomesCovered = true;
  } else if (!snap.allHomesCovered && prevAllHomesCovered) {
    prevAllHomesCovered = false;
  }
  currentBuildings = snap.buildings;
  if (!useServer && !openingFramed && inputReady) {
    const seeded = currentBuildings.filter((b) => b.type !== "road" && b.type !== "bridge");
    if (seeded.length > 0) {
      const cx = seeded.reduce((sum, b) => sum + (b.x + b.w / 2), 0) / seeded.length;
      const cy = seeded.reduce((sum, b) => sum + (b.y + b.h / 2), 0) / seeded.length;
      const c = iso.tileToIso(cx, cy);
      camera.setCenter(c.x, c.y);
      camera.setZoom(clampZoom(MAX_ZOOM));
      openingFramed = true;
    }
  }
  currentVillagers = snap.villagers;
  localPlayerId = snap.localPlayerId;
  // Phase 3
  happiness = snap.happiness;
  traderPresent = snap.traderPresent;
  traderOffersList = snap.traderOffers;
  // Phase 4
  currentRaiders = snap.raiders;
  // Render-only interpolation bookkeeping: feed the new snapshot's unit positions
  // and measure the inter-snapshot interval (so the glide adapts to 1×/2×/4× and
  // jitter). performance.now() is the render clock — main-thread only, never sim.
  // Citadel 97/13: pause/resume/speed-change/host-migration corrections re-broadcast
  // the SAME tick's snapshot (no tick runs while paused); only ingest + reset the
  // clock when the tick has actually advanced, or a correction would shift prev<-cur
  // mid-glide and hop a unit forward instead of finishing its glide.
  if (shouldIngestSnapshot(lastIngestedTick, snap.tick)) {
    lastIngestedTick = snap.tick;
    const nowMs = performance.now();
    if (lastSnapshotMs > 0) {
      const dt = nowMs - lastSnapshotMs;
      // Light smoothing so one late frame doesn't lengthen the glide; clamp out
      // pauses/tab-throttle (a multi-second gap must not stretch the lerp).
      const clamped = Math.min(dt, 1000);
      snapshotIntervalMs = snapshotIntervalMs === 0 ? clamped : snapshotIntervalMs * 0.6 + clamped * 0.4;
    }
    lastSnapshotMs = nowMs;
    villagerInterp.ingest(currentVillagers);
    raiderInterp.ingest(currentRaiders);
  }
  threatLevel = snap.threatLevel;
  defensiveStrength = snap.defensiveStrength;
  keepPresent = snap.keepPresent;
  keepSacked = snap.keepSacked;
  nextRaidDay = snap.nextRaidDay;
  // Phase 4.5 hazards
  sickVillagers = snap.sickVillagers;
  outbreakActive = snap.outbreakActive;
  activeFires = snap.activeFires;

  // Phase G: the old always-on DOM trader panel is gone — the tradingpost's in-canvas inspect
  // panel now renders the ≤3-offer trade menu (tradeBox in inspect-panel.ts), gated on
  // traderPresent + only shown while that building is selected. traderPresent/traderOffersList
  // are read straight from the panel's refresh() call in render-loop.ts.

  // Brief 19: release the follow if its villager despawned (night / starvation). The in-canvas
  // villager panel re-finds the live villager by id each frame in render-loop.ts, so the
  // per-snapshot readout refresh is no longer needed here; we just clear the a11y mirror on a
  // despawn release.
  const stillFollowing = followReleaseId(followId, currentVillagers);
  if (followId !== null && stillFollowing === null) villagerMirror?.update(null);
  setFollowId(stillFollowing);
});
