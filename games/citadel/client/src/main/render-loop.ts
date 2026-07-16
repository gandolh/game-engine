import { TILE_SIZE } from "@citadel/sim-core";
import type { SettlementTier } from "@citadel/sim-core";
import { expSmooth } from "@engine/core";
import { computeLayout, renderTree, label } from "@engine/ui";
import type { LabelNode } from "@engine/ui";
import { CITADEL_PAL as EDG } from "../render/citadel-palette";
import {
  fitCameraToCanvas,
  pushScene,
  pushGhost,
  pushLightPool,
  pushAmbientCrowd,
  pushWearOverlay,
  pushFire,
  pushCatchment,
  pushDisconnectedMarkers,
  cloudOptionsFor,
  transformOf,
} from "../render/citadel-renderer";
import {
  syncAppearMap,
  buildingKey,
  placementScale,
  easeQuad,
  gaitOffset,
  villagerById,
  wellServedGlowQuads,
  wellServedPulse,
} from "../render/citadel-fx";
import { computeWash, dayFractionOf, nightFactorOf, emittersOf, lightPoolQuads } from "../render/atmosphere";
import {
  serviceTint,
  serviceCatchment,
  coverageByNeed,
  uncoveredHouseTiles,
} from "../render/coverage";
import { findSelected } from "../ui/selection";
import { MINIMAP_FACE } from "../ui/minimap";
import { CITADEL_THEME } from "../ui/citadel-theme";
import { VISUAL_DAY_TICKS } from "./constants";
import { canvas } from "./dom";
import { camera, renderer, windowController, iso } from "./renderer-state";
import { terrain } from "./terrain";
import { placementState } from "./placement-wiring";
import { renderToggles, particles, smoke, fire, appearAt, burningSince, villagerInterp, raiderInterp, weather, ambientCrowd } from "./fx";
import { toasts, occupancyBadges } from "./hud-wiring";
import {
  currentBuildings,
  currentVillagers,
  currentRaiders,
  tier,
  day,
  season,
  population,
  popCap,
  stockpiles,
  foodSurplus,
  happiness,
  paused,
  speed,
  isHost,
  threatLevel,
  nextRaidDay,
  defensiveStrength,
  keepPresent,
  keepSacked,
  activeFires,
  outbreakActive,
  sickVillagers,
  traderPresent,
  traderOffersList,
  peakTier,
  localPlayerId,
  latestSnapshot,
  lastSnapshotMs,
  snapshotIntervalMs,
  tick,
  CHARGE_BUILD_COST,
} from "./sim-client";
import { snapshotPhase, RENDER_DELAY_INTERVALS } from "../render/entity-interp";
import { debugOverlay } from "./debug-overlay-wiring";
import { hud, uiSurface, a11yMirror, siegeHud, siegeMirror } from "./hud-panels";
import { inspectPanel, inspectSelection, inspectMirror, closeInspect } from "./inspect";
import {
  villagerPanel,
  villagerMirror,
  buildBar,
  buildBarDispatcher,
  buildBarMirror,
  followId,
  modeLabelText,
} from "./build-controls";
import { settingsModal, settingsMirror, setSettingsLaidOut } from "./settings";
import { newGameModal, newGameMirror } from "./new-game";
import { minimap } from "./minimap-wiring";
import { tileToCanvasCss } from "./screen-mapping";
import { coverageOverlay, lastUiX, lastUiY } from "./input";

// The bar is laid out at the bottom-left only when first shown or the canvas height changes
// (labels are fixed → layout depends only on the bottom anchor). `barTopY` is its top edge.
let barLaidOutH = -1;
let barTopY = 0;

// Todo 2026-07-15-citadel-status-collapsible-panel: the siege/hazard HUD's "Status" toggle is
// now collapsible and may start CLOSED (a returning player who previously collapsed it — see
// panel-prefs.ts). A closed panel's first refresh() returns `false` (see hud-panels.ts's
// createStatusPanel), which would leave its root at the zero rect on load — an unclickable
// toggle button (the exact trap Farm's brief 117 hit; see player-and-interaction.md). This
// size-key sentinel mirrors Farm's `matrixLaidOutSize`/`rcLaidOutW`: starting at "" guarantees a
// mismatch on the very first frame, forcing that first layout regardless of `siegeContentChanged`,
// and re-anchoring on canvas resize thereafter.
let siegeLaidOutSizeKey = "";

let lastFrameMs = 0; // render clock (performance.now, MAIN-thread only — NOT sim)

/** Count of windowed re-bakes since boot. Diagnostic only — read by the boot.ts dev hook. */
export let windowBakes = 0;

const buildBarInfoLabel: LabelNode = label("", { muted: true });

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
export function loop(): void {
  // engine-ui chunk 7: the settlement readout (tier/day/pop/happiness), the goods strip + the
  // speed/pause buttons are rendered IN-CANVAS via @engine/ui now. Refresh their widget
  // text/state from the latest snapshot here; the actual layout + draw happens after the
  // world scene is submitted, below (so the HUD paints on top). hud may be undefined for
  // the first frame(s) before boot() finishes — guard it.
  // refresh() returns whether LAYOUT-AFFECTING content changed (label text / button label).
  // HUD content only changes on sim ticks (~1–4 Hz), so we gate the per-frame-expensive
  // computeLayout + a11y-mirror reconcile behind it (see the HUD submit block below).
  // renderTree + surface.begin/end still run EVERY frame (the UI layer is re-submitted each
  // frame). undefined on the first frame(s) before boot — treat that as "no HUD to lay out".
  const hudContentChanged = hud?.refresh({
    tier, day, season, population, popCap,
    stockpiles, foodSurplus, happiness, paused, speed, isHost,
  }) ?? false;
  // Chunk 1A (brief 106): the siege/hazard HUD (former Phase 4 + 4.5 DOM readouts) + the
  // placement-mode label (former #lbl-mode), now a SECOND in-canvas UI root. Same
  // refresh()-returns-layout-changed gating as the resource HUD above; its layout + draw runs
  // alongside the resource HUD's, further down (siegeHud may be undefined pre-boot).
  const siegeContentChanged = siegeHud?.refresh({
    threatLevel, nextRaidDay, defensiveStrength, keepPresent, keepSacked,
    activeFires, outbreakActive, sickVillagers, modeText: modeLabelText,
  }) ?? false;

  // --- Render clock (performance.now is main-thread only — never the sim).
  const nowMs = performance.now();
  const timeSec = nowMs / 1000;
  const dt = lastFrameMs === 0 ? 0 : Math.min(0.1, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;

  // Render-only movement interpolation phase: elapsed fraction of the measured
  // inter-snapshot interval since the newest snapshot. positionOf renders a fixed
  // RENDER_DELAY_INTERVALS behind the newest (a jitter buffer) so units glide
  // between two already-arrived snapshots instead of racing the newest and holding
  // when it's late — see entity-interp.ts. When paused there are no new snapshots,
  // so we pass the full delay (⇒ drawn at the current tile, at rest). Computed here
  // (before the follow-cam) so both the cam target and pushScene share it.
  const interpPhase = paused ? RENDER_DELAY_INTERVALS : snapshotPhase(nowMs, lastSnapshotMs, snapshotIntervalMs);

  // --- Brief 17 placement ease-in: diff the building set against the appear map
  // (records first-seen render-clock ms per x,y,type; drops demolished keys).
  syncAppearMap(appearAt, currentBuildings, nowMs);

  // --- Brief 24 wear/decay (render-only): track when each building first started
  // burning so the soot overlay can ramp from ignition. Drop keys once the fire
  // is out (so a re-ignite re-ramps) or the building is gone.
  {
    const burningKeys = new Set<string>();
    for (const b of currentBuildings) {
      if (!b.burning && !b.onFire) continue;
      const key = buildingKey(b);
      burningKeys.add(key);
      if (!burningSince.has(key)) burningSince.set(key, nowMs);
    }
    for (const key of burningSince.keys()) {
      if (!burningKeys.has(key)) burningSince.delete(key);
    }
  }

  // --- Brief 19 follow-cam glide: lerp the camera centre toward the followed
  // villager's world position with expSmooth (a smooth glide, not a snap). Target
  // the villager's INTERPOLATED position (the same render-delayed position it's
  // drawn at), so the followed figure stays centred instead of trailing the cam by
  // the buffer's ~2-tile latency.
  if (followId !== null) {
    const fv = villagerById(currentVillagers, followId);
    if (fv !== null) {
      const fp = villagerInterp.positionOf(followId, interpPhase, fv.x, fv.y);
      const targetX = fp.x * TILE_SIZE + TILE_SIZE / 2;
      const targetY = fp.y * TILE_SIZE + TILE_SIZE / 2;
      camera.setCenter(
        expSmooth(camera.centerX, targetX, 6, dt),
        expSmooth(camera.centerY, targetY, 6, dt),
      );
    }
  }

  // --- WebGPU scene: terrain is the baked static layer; entities + ghost are
  // sprite-batch quads. beginFrame sizes the canvas backing store, so fit the
  // camera to it first.
  renderer.beginFrame();
  fitCameraToCanvas(camera, canvas.width, canvas.height, iso);

  // Brief 21/22: re-bake the camera-windowed static layer when the window shifts
  // (drained at a per-frame budget so a fast pan never triggers a synchronous
  // re-bake). Live since brief 110 grew the solo world to 192×192 — below the
  // windowing threshold this is a no-op and the whole world is baked once.
  if (windowController.update(camera)) windowBakes++;

  // Brief 17 FX hooks: placement ease-in (building scale/alpha) + idle bob
  // (villager Y) + render-only position interpolation (villager/raider glide).
  // All pure; the appear map + render clock + interpolators feed them here.
  // Day/night phase — computed before pushScene so buildings can pick their warm
  // dusk-lit window-glow frame (the strongest cozy cue) at night. Pure function
  // of the render-side tick mirror; also reused below for light pools + wash.
  const dayFraction = dayFractionOf(tick, VISUAL_DAY_TICKS);
  const nightFactor = nightFactorOf(dayFraction);

  pushScene(
    renderer,
    iso,
    {
      buildings: currentBuildings,
      villagers: currentVillagers,
      raiders: currentRaiders,
    },
    {
      building: (b, quad) => {
        const born = appearAt.get(`${b.x},${b.y},${b.type}`);
        if (born === undefined) return { quad, alpha: 1 };
        const fx = placementScale(nowMs - born);
        return { quad: easeQuad(quad, fx), alpha: fx.alpha };
      },
      // Movement-aware gait: walking villagers get a springy step hop, idle ones
      // keep the gentle sway. `isMoving` comes from the interpolator (prev≠cur).
      villagerYOffset: (v) => gaitOffset(timeSec, v.id, villagerInterp.isMoving(v.id)),
      villagerPos: (v) => villagerInterp.positionOf(v.id, interpPhase, v.x, v.y),
      raiderPos: (r) => raiderInterp.positionOf(r.id, interpPhase, r.x, r.y),
    },
    // Render clock drives render-only animation (the mill's rotating sails,
    // villager/raider walk cycles). performance.now — main-thread only, never sim.
    nowMs,
    // Night factor selects warm dusk-lit building frames (cozy window glow).
    nightFactor,
  );

  // --- Brief 24 wear/decay soot overlay (render-only). For each burning
  // building, stamp soot ramped by how long it's been on fire (per-building
  // render clock from burningSince). Healthy buildings emit nothing.
  for (const b of currentBuildings) {
    if (!b.burning && !b.onFire) continue;
    const since = burningSince.get(buildingKey(b)) ?? nowMs;
    pushWearOverlay(renderer, [b], nowMs - since);
  }

  // --- art-07 FIRE FX (render-only). Cozy flame billboards + warm ground-glow
  // over burning buildings, composing OVER the soot/orange-tint. Flame flicker +
  // glow breath are render-clock functions (deterministic); nightFactor brightens
  // the glow at night. Embers + fire-smoke particles are emitted below.
  pushFire(renderer, iso, currentBuildings, nowMs, nightFactor);

  // --- Atmosphere (render-only). Day/night wash + night light pool (brief 15),
  // ambient crowd (brief 18), weather (brief 16). All driven off snapshot
  // fields (tick/season/tier/day) + the render clock — zero sim impact.
  // (dayFraction / nightFactor are computed above, before pushScene.)

  // Night light pool: warm glow quads over emitter buildings (sprite-batch).
  // Brief 25: gated — when off, skip the push entirely (no quads emitted).
  if (renderToggles.lightPool) {
    pushLightPool(renderer, iso, lightPoolQuads(emittersOf(currentBuildings), nightFactor));
  }

  // Brief 100: a soft, slowly-breathing pool under each producer the town is reliably
  // serving — the diegetic read for "this building is thriving because of how you laid
  // the place out". Stamped through the same ground-pool helper as the night light
  // pool, but ungated by nightFactor: it must be legible at any hour.
  pushLightPool(renderer, iso, wellServedGlowQuads(currentBuildings, wellServedPulse(nowMs)));

  // Ambient crowd: wandering pedestrians, density by tier (sprite-batch).
  // Brief 25: gated — when off, skip both the update and the push.
  if (renderToggles.ambientCrowd) {
    if (latestSnapshot !== null) ambientCrowd.update(dt, latestSnapshot);
    pushAmbientCrowd(renderer, iso, ambientCrowd.quads());
  }

  const ghost = placementState.ghost();

  // --- Service coverage (OpenTTD-influence brief, 2026-06-22). Two paths share
  // one ground-tile decal: the full overlay (toggled with `C`) washes every
  // catchment by need so gaps are visible at a glance; the placement ring previews
  // the selected service's reach around the ghost BEFORE committing. Render-only —
  // the tile geometry mirrors the sim's coverage math (render/coverage.ts).
  if (coverageOverlay) {
    // Clamp against the LIVE terrain, not the compile-time default dims — an
    // exported constant is what let the client silently disagree with the sim
    // about world size for as long as it did (brief 110).
    for (const grp of coverageByNeed(currentBuildings, terrain)) pushCatchment(renderer, iso, grp.tiles, grp.hex);
    // Cozy-pivot Phase F (decision #7): frame the overlay's gaps as a soft
    // invitation rather than raw data — a slow, low-amplitude pulse on houses
    // missing a core need. Only drawn while the player pulled up the overlay
    // (never always-on). Reuses pushCatchment's edge/fill alpha split (0.34 vs
    // 0.16) as the two pulse levels, driven by the render clock so it never
    // touches determinism; a ~2.4s period keeps it gentle, not attention-grabbing.
    const invited = uncoveredHouseTiles(currentBuildings);
    if (invited.length > 0) {
      const lit = Math.sin((nowMs / 1000) * (Math.PI * 2 / 2.4)) > 0;
      const pulseTiles = invited.map((t) => ({ tx: t.tx, ty: t.ty, edge: lit }));
      pushCatchment(renderer, iso, pulseTiles, EDG.cream);
    }
  }
  if (placementState.mode === "place" && ghost !== null) {
    const cx = ghost.tileX + Math.floor(ghost.w / 2);
    const cy = ghost.tileY + Math.floor(ghost.h / 2);
    // serviceCatchment dispatches on shape: the well previews its 8×6 rectangle;
    // diamond services preview their Manhattan ring. Empty for non-services.
    const ring = serviceCatchment(placementState.selectedType, cx, cy, terrain);
    if (ring.length > 0) {
      pushCatchment(renderer, iso, ring, serviceTint(placementState.selectedType));
    }
  }

  // --- Road-builder feedback: float a "no road" pip over any production/housing/
  // storage building that isn't connected to the network, so the connectivity the
  // economy depends on is visible (the `connected` flag was previously unsurfaced).
  // Render-only; reads the snapshot flag. nowMs drives the gentle attention pulse.
  pushDisconnectedMarkers(renderer, iso, currentBuildings, nowMs);

  const dragging = (placementState.mode === "road" || placementState.mode === "wall") && placementState.isDraggingRoad;
  // Drag preview tints each tile green/red by whether the sim will accept it.
  pushGhost(renderer, iso, ghost, dragging ? placementState.roadTilesWithValidity() : []);

  // Weather field (engine RainField → GPU WeatherPass). Update against the
  // visible world rect, then hand it to endFrame.
  // Brief 25: gated — when weather is off, skip the field update so endFrame
  // receives no weather pass below.
  if (renderToggles.weather) {
    const halfX = camera.worldUnitsX / 2;
    const halfY = camera.worldUnitsY / 2;
    weather.update(dt, season, day, {
      left: camera.centerX - halfX,
      right: camera.centerX + halfX,
      top: camera.centerY - halfY,
      bottom: camera.centerY + halfY,
    });
  }

  // Brief 17 chimney smoke: emit rising grey puffs from bakery/smith/woodcutter
  // (render-side RNG jitter only), advance the pool, hand it to endFrame so the
  // WebGPU particle pass draws it natively (the overlay callback is a no-op).
  // Brief 25: gated — when off, skip emission (existing puffs still advance/age
  // out via particles.update so the pool drains cleanly).
  if (renderToggles.smoke) smoke.update(currentBuildings, nowMs);
  // art-07: fire embers + fire-smoke particles for burning buildings (shares the
  // smoke toggle — both are the particle-FX channel). Emits nothing when nothing
  // burns; capped internally so a town-wide fire can't swamp the pool.
  if (renderToggles.smoke) fire.update(currentBuildings, nowMs);
  particles.update(dt);

  // engine-ui chunk 7: lay out + submit the in-canvas HUD. computeLayout writes screen-px
  // rects (CSS logical, top-left origin); renderTree emits quads/text through the UISurface
  // (renderer.beginUI/pushUI/endUI), which the renderer flushes LAST inside endFrame() so
  // the HUD paints on top of the world scene + wash. Anchored at the top-left (8,8). The
  // a11y mirror is reconciled against the same tree so the HUD is keyboard/AT-reachable.
  if (hud !== undefined && uiSurface !== undefined) {
    // Gate ONLY the expensive work (computeLayout allocates + re-measures every label;
    // a11yMirror.update re-walks + re-patches the DOM) behind a content change — content
    // changes at sim-tick rate (~1–4 Hz), not frame rate (~60 Hz). The first frame's refresh
    // returns true, so the initial layout always runs. renderTree re-submits the (already
    // laid-out) tree EVERY frame so hover/active colour changes still paint immediately.
    if (hudContentChanged) {
      computeLayout(hud.root, 8, 8);
      a11yMirror?.update(hud.root);
    }
    uiSurface.begin();
    renderTree(uiSurface, hud.root, CITADEL_THEME);

    // Chunk 1A (brief 106): the siege/hazard HUD is a SECOND top-row UI root, anchored directly
    // below the resource HUD's MEASURED bottom edge (its rect is already live this frame — no
    // guessed pixel constant) rather than a fixed y, so the two rows never overlap regardless of
    // font/scale changes. `siegeHudBottom` feeds the inspect panel + toast anchors below.
    const hudBottom = hud.root.rect.y + hud.root.rect.height;
    let siegeHudBottom = hudBottom;
    if (siegeHud !== undefined) {
      // Todo 2026-07-15-citadel-status-collapsible-panel: `siegeSizeKey` mismatching on the
      // first frame (and on resize) forces the layout pass even when the "Status" panel starts
      // collapsed and `siegeContentChanged` is `false` — see the sentinel's doc above.
      const siegeSizeKey = `${canvas.clientWidth}x${canvas.clientHeight}`;
      if (siegeContentChanged || siegeLaidOutSizeKey !== siegeSizeKey) {
        computeLayout(siegeHud.root, 8, Math.round(hudBottom + 4));
        siegeMirror?.update(siegeHud.root);
        siegeLaidOutSizeKey = siegeSizeKey;
      }
      renderTree(uiSurface, siegeHud.root, CITADEL_THEME);
      siegeHudBottom = siegeHud.root.rect.y + siegeHud.root.rect.height;
    }

    // Inspect chunk 2: the inspect panel is a THIRD UI root rendered inside the SAME
    // surface.begin()/end(), after the HUD so it paints on top. Re-find the live snapshot
    // for the selected building by footprint origin each frame; if it vanished (demolished),
    // auto-close. Then refresh + lay out + draw + mirror — all gated on being open.
    if (inspectPanel !== undefined && inspectSelection !== null) {
      const b = findSelected(currentBuildings, inspectSelection);
      if (b === null) {
        closeInspect(); // also clears the a11y mirror (every close path does)
      } else {
        const changed = inspectPanel.refresh({
          type: b.type,
          level: b.level,
          connected: b.connected,
          workerCount: b.workerCount,
          outputBuffer: b.outputBuffer,
          season,
          stockpiles: latestSnapshot?.stockpiles ?? {},
          // Tier the owner has reached — mirrors the sim's upgrade gate (unlockTier = peakTier).
          peakTier: peakTier as SettlementTier,
          // Phase G: the trade-offer affordance (tradingpost-only; the panel ignores these
          // fields for every other building type).
          traderPresent,
          traderOffers: traderOffersList,
        });
        // Floating position: pinned to the LEFT edge, BELOW both top HUD rows (the resource HUD
        // AND, since chunk 1A, the siege/hazard HUD — `siegeHudBottom` is their measured combined
        // bottom edge) so it never overlaps either or the top-right minimap. The panel has a
        // fixed width:240, so it doesn't reflow the world or the HUD rows above it.
        if (changed) {
          computeLayout(inspectPanel.root, 8, Math.round(siegeHudBottom + 8));
          inspectMirror?.update(inspectPanel.root);
        }
        renderTree(uiSurface, inspectPanel.root, CITADEL_THEME);
      }
    }

    // Villager-job chunk 3: the follow-a-villager panel is a FOURTH UI root, rendered inside the
    // SAME surface.begin()/end(), after the HUD + inspect panel so it paints on top. Open iff a
    // villager is followed; re-find the live villager by id each frame (villagers have a stable
    // id). If it vanished, the snapshot handler already released the follow + cleared the mirror,
    // so `followId` is null here and we skip. Then refresh + lay out + draw + mirror.
    if (villagerPanel !== undefined && followId !== null) {
      const fv = villagerById(currentVillagers, followId);
      if (fv !== null) {
        const changed = villagerPanel.refresh({
          id: fv.id,
          job: fv.job,
          fsm: fv.fsm,
          carryGood: fv.carryGood,
        });
        // Floating position: pinned to the BOTTOM-LEFT corner (anchored by its TOP edge well
        // below the top HUD bar + the inspect panel at 8,56, and clear of the top-right minimap).
        // y=380 keeps the ~110px-tall card on-screen above the bottom build toolbar.
        if (changed) {
          computeLayout(villagerPanel.root, 8, 380);
          villagerMirror?.update(villagerPanel.root);
        }
        renderTree(uiSurface, villagerPanel.root, CITADEL_THEME);
      }
    }

    // Build bar: a bottom-left in-canvas UI root (build-bar.ts), rendered before the toasts so
    // they paint over it. Re-bind button states each frame from the live placement state; lay it
    // out at the bottom only when first shown or the canvas height changed (labels are fixed).
    if (buildBar !== undefined) {
      const barChanged = buildBar.refresh({
        mode: placementState.mode,
        selectedType: placementState.selectedType,
        peakTier: peakTier as SettlementTier,
        chargeBuildCost: CHARGE_BUILD_COST,
        stockpiles,
      });
      if (barLaidOutH !== canvas.clientHeight) {
        computeLayout(buildBar.root, 0, 0); // measure → height
        barTopY = canvas.clientHeight - buildBar.root.rect.height - 8;
        computeLayout(buildBar.root, 8, barTopY); // anchor bottom-left
        barLaidOutH = canvas.clientHeight;
        buildBarMirror?.update(buildBar.root);
      } else if (barChanged) {
        buildBarMirror?.update(buildBar.root); // disabled/active changed → reconcile the AT view
      }
      renderTree(uiSurface, buildBar.root, CITADEL_THEME);

      // Hover-info: the hovered toolbar button's cost/tier text, just above the bar.
      const info = buildBar.hoverInfoFor(buildBarDispatcher?.hitTest(lastUiX, lastUiY) ?? null);
      if (buildBarInfoLabel.text !== info) buildBarInfoLabel.text = info;
      if (info !== "") {
        computeLayout(buildBarInfoLabel, 8, Math.max(8, barTopY - 16));
        renderTree(uiSurface, buildBarInfoLabel, CITADEL_THEME);
      }
    }

    // Per-building occupancy badges: headcount chips over each of the local player's buildings
    // that has people at it (idle residents / workers). Now IN-CANVAS @engine/ui chips, drawn
    // through the same surface (world-anchored: each chip positioned at its building's top-centre
    // tile in CANVAS-relative CSS-logical px — the surface's coordinate space). In-transit
    // villagers are drawn on roads instead (Part A), so badges + road dots == population.
    occupancyBadges.update(currentBuildings, localPlayerId, tileToCanvasCss);
    for (const chip of occupancyBadges.activeChips) {
      computeLayout(chip.node, chip.x, chip.y);
      renderTree(uiSurface, chip.node, CITADEL_THEME);
    }

    // Minimap (top-right): drawn IN-CANVAS via raw UISurface quads (terrain + entity specks +
    // camera viewport). Anchored 8px from the top-right corner. Reads snapshots + the camera
    // transform only (render-only).
    if (minimap !== null) {
      const mx = canvas.clientWidth - MINIMAP_FACE - 8;
      minimap.draw(uiSurface, mx, 8, {
        buildings: currentBuildings,
        villagers: currentVillagers,
        raiders: currentRaiders,
        transform: transformOf(camera, canvas.width, canvas.height),
      });
    }

    // Event toasts: a top-CENTRE in-canvas UI root (toast.ts), rendered after the badges/minimap
    // so it paints over them. Two layout passes when toasts are present: the first fills rects so
    // we know the stack width, the second re-anchors it centred at the top. Per-frame opacity (the
    // fade) is render-only — it doesn't change layout — so this is cheap (≤4 small panels).
    if (toasts.root.children.length > 0) {
      computeLayout(toasts.root, 0, 0);
      const cx = Math.max(8, (canvas.clientWidth - toasts.root.rect.width) / 2);
      // Anchor the top-centre stack just BELOW both in-canvas HUD rows' real bottom edge (the
      // resource HUD AND, since chunk 1A, the siege/hazard HUD below it). The resource HUD is a
      // single left-anchored row whose right-end speed/pause controls reach toward screen centre
      // on wide windows — the same band a centred toast would sit in — so a fixed y (the old 48)
      // let the buttons and toasts overlap. `siegeHudBottom` (computed above, in the same
      // `hud !== undefined` block) is already the measured combined bottom edge.
      computeLayout(toasts.root, cx, Math.round(siegeHudBottom + 8));
      renderTree(uiSurface, toasts.root, CITADEL_THEME);
    }

    // Settings modal: a top-most in-canvas UI root, rendered LAST so it overlays everything while
    // open. Centred on the canvas (measure → re-anchor, like the toasts). show() resyncs the
    // controls but doesn't lay out / reconcile the mirror; we do that every frame so hover/active
    // colours and tab-swap content changes are reflected live in both the canvas and the AT view.
    // Fix 2: reconcile the mirror every frame while open (not just once via settingsLaidOut).
    // The modal's tab buttons call settingsModal.selectTab(i) which swaps the visible content
    // panel; without a per-frame update the screen-reader sees the previous tab's controls (stale
    // DOM). mirror.update() is idempotent + diffs by node id — per-frame is safe and cheap for a
    // small modal. computeLayout runs BEFORE mirror.update so rects are current.
    if (settingsModal.isOpen()) {
      computeLayout(settingsModal.root, 0, 0); // measure → modal size
      const sx = Math.max(8, (canvas.clientWidth - settingsModal.root.rect.width) / 2);
      const sy = Math.max(8, (canvas.clientHeight - settingsModal.root.rect.height) / 2);
      computeLayout(settingsModal.root, sx, sy); // anchor centred
      settingsMirror?.update(settingsModal.root); // reconcile every frame (tab-swap + first open)
      setSettingsLaidOut(true); // kept for the openSettings() gate (signals boot is past first frame)
      renderTree(uiSurface, settingsModal.root, CITADEL_THEME);
    }

    // Brief 103: the new-game picker — rendered LAST of all, above even the settings modal, because
    // until it is answered no game exists. Same centred measure → re-anchor as the modal above; the
    // mirror is reconciled every frame while open and dropped (update(null)) once a mode is chosen.
    if (newGameModal !== undefined && newGameModal.isOpen()) {
      computeLayout(newGameModal.root, 0, 0); // measure → dialog size
      const nx = Math.max(8, (canvas.clientWidth - newGameModal.root.rect.width) / 2);
      const ny = Math.max(8, (canvas.clientHeight - newGameModal.root.rect.height) / 2);
      computeLayout(newGameModal.root, nx, ny); // anchor centred
      newGameMirror?.update(newGameModal.root);
      renderTree(uiSurface, newGameModal.root, CITADEL_THEME);
    }

    uiSurface.end();
  }

  // Day/night + seasonal wash (GPU TintPass via endFrame), then particles +
  // weather (both rendered natively by the WebGPU backend).
  // Brief 25: gated — pass undefined wash/weather when their toggles are off.
  const wash = renderToggles.wash ? computeWash(season, dayFraction) : undefined;
  const weatherField = renderToggles.weather ? weather.field : undefined;

  // fBm cloud-shadow + morning-haze overlay (art-03 P2). Drawn by the engine's
  // CloudShadowPass inside endFrame (below the wash) when coverage > 0.001.
  // Coverage/mode are a PURE function of season/day + dayFraction; timeSec is the
  // render clock (the pass world-anchors the fBm, so it stays put under pan/zoom).
  if (renderToggles.clouds) {
    renderer.setCloudOptions?.(cloudOptionsFor(season, day, dayFraction, timeSec));
  }

  renderer.endFrame(wash, particles, weatherField);

  toasts.tick(nowMs); // age toasts on the render clock

  // Chunk F (todo 2026-07-15-citadel-fps-debug-overlay.md): feed the corner debug overlay
  // (undefined outside dev builds — see debug-overlay-wiring.ts). "alpha" maps to the same
  // render-delay interp phase driving villager/raider glide above (entity-interp.ts); "ents" is
  // the villager+raider+building counts the renderer already iterates every frame.
  debugOverlay?.update({
    tick,
    alpha: interpPhase,
    entityCount: currentBuildings.length + currentVillagers.length + currentRaiders.length,
  });

  requestAnimationFrame(loop);
}
