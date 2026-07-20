/**
 * Hollow's cozy 3D town app shell (chunk hollow-09a, agents added in
 * hollow-09b) — the render loop that reads the Worker's `HollowSnapshot`
 * stream and draws the town: ground with gentle terrain relief, soft
 * per-community territory tints, households (clustered by community, sized
 * by family), distinct resource-node meshes, and gene-driven animated
 * humanoid agents. A free orbit/pan/zoom camera and a sim-clock-driven
 * day/night wash round it out. Glyph/tag overlays and click-to-inspect are
 * chunk hollow-09c's job — see the clearly marked SEAM comments (the world
 * material table + the `agentRenderState`/`getViewProj` accessors below) for
 * exactly where that plugs in.
 *
 * Sim/render boundary (CLAUDE.md): this module ONLY reads `HollowSnapshot`s
 * off `worker`'s `message` events and the render clock
 * (`requestAnimationFrame`'s `nowMs`, ultimately `performance.now()`) — it
 * never touches sim state directly and nothing here is ever fed back into
 * the sim. Determinism is unaffected by anything in this file.
 */
import {
  createDevice3d,
  SceneRenderer3D,
  OrbitCamera,
  packInstances,
  instanceAABB,
  transformPoint,
  materialIndexMap,
  multiply,
  translation,
  scaling,
  identity,
  rayFromScreen,
  pickNearest,
  type Mat4,
  type Vec3,
  type Mesh,
  type MeshHandle,
  type DrawCall3d,
} from "@engine/core/render3d";
import type { WorkerOutbound } from "../worker/sim-worker";
import { HOLLOW_PAL } from "../render/hollow-palette";
import { GRID_SIZE } from "@hollow/sim-core/world";
import { SnapshotBuffer } from "./interp";
import { groundHeightAt } from "./terrain";
import { buildGroundMesh, buildTerritoryTileMesh, TERRITORY_TINT_Z_OFFSET } from "./world-meshes";
import { householdLayout, householdMemberCounts, homeMeshFor, MAX_HOME_FOOTPRINT, type HouseholdPosition } from "./household-layout";
import { findFreePlacement, footprintRect, HOME_MARGIN, type Rect } from "./home-placement";
import { baseNodeMeshFor, fullnessScale, resourceNodeFullness } from "./node-mesh";
import { dayNightPhase, dayNightFromPhase, RENDER_DAY_TICKS } from "./day-night";
import { wireOrbitCameraInput, type CameraInputHandle } from "./camera-input";
import {
  WORLD_MATERIAL_KEYS,
  buildWorldMaterialList,
  territoryTintColor,
  toFloatRgb,
  WHITE_TINT,
} from "./materials";
import {
  buildHumanoid,
  buildAgentMaterialList,
  AGENT_MATERIAL_KEYS,
  CLOTH_KEY,
  stageScale,
  humanoidTint,
  variantKey,
  VariantCache,
  HEAD_TOP_LOCAL,
  type PoseKey,
} from "./humanoid";
import { AgentFacingTracker, poseForAgent, walkBob, agentModelMatrix } from "./agent-anim";
import { selectedTint } from "./selection";

export interface HollowAppOptions {
  /** Must match the seed the worker was `init`ed with (only used here to
   *  derive the day/night phase — see day-night.ts). */
  readonly ticksPerDay: number;
  /** Chunk hollow-09c: fired after a canvas click resolves a ray-pick over
   *  the current frame's agent AABBs (`getAgentRenderState()`'s `bounds`) —
   *  `agentId` is the picked agent, or `null` if the click hit nothing. The
   *  app already applies its own 3D highlight for the pick before calling
   *  this; the caller (`main.ts`) uses it to fire the `"inspect"` worker
   *  round-trip and show the panel. */
  onAgentClicked?(agentId: number | null): void;
  /** Chunk hollow-09c: fired when an active follow-cam gets cancelled by a
   *  manual pan (see `setFollow`'s doc) — lets the caller keep its own
   *  "is following" UI state (the panel's follow button) in sync. */
  onFollowCancelled?(): void;
}

/** Per-agent render outputs, recomputed every frame — the SEAM chunk
 *  hollow-09c consumes for its glyph/tag overlay (project `headWorld`
 *  through `getViewProj()`'s matrix for on-screen placement) and
 *  click-to-inspect (ray-test `bounds`, the same `instanceAABB` + `pickNearest`
 *  idiom `render3d-demo.ts` already proves out). */
export interface AgentRenderState {
  /** World-space position of the top of this agent's head. */
  readonly headWorld: Vec3;
  /** This agent's current per-instance model matrix. */
  readonly model: Mat4;
  /** World-space AABB of this agent's current pose/instance. */
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
}

export interface HollowApp {
  /** Tears down listeners/observers/the render loop. Idempotent. */
  dispose(): void;
  /** SEAM for chunk hollow-09c: every alive agent's world head-position +
   *  model matrix + world AABB, as of the most recently drawn frame. `null`
   *  before the first frame renders (e.g. no WebGPU, or no snapshot yet). */
  getAgentRenderState(): ReadonlyMap<number, AgentRenderState> | null;
  /** SEAM for chunk hollow-09c: the `viewProj` matrix used for the most
   *  recently drawn frame — combine with `getAgentRenderState()`'s
   *  `headWorld` to project agent glyphs/tags to screen space. `null`
   *  before the first frame renders. */
  getViewProj(): Mat4 | null;
  /** Sets (or clears, `null`) which agent gets the picked-instance
   *  highlight (`selection.ts`'s `selectedTint`) — called by `main.ts` both
   *  right after a click-resolved pick and when the inspect panel's close
   *  button clears the selection. Idempotent; takes effect next frame. */
  setSelectedAgent(agentId: number | null): void;
  /** Turns follow-cam on (an agent id) or off (`null`) — while on, the
   *  camera's `target` is re-set every frame to that agent's INTERPOLATED
   *  position (`SnapshotBuffer`), preserving yaw/pitch/distance so the
   *  player can keep orbiting/zooming around the followed agent. A manual
   *  pan cancels it (see `HollowAppOptions.onFollowCancelled`); so does the
   *  followed agent no longer being alive next frame. */
  setFollow(agentId: number | null): void;
  /** The agent currently being followed, or `null`. */
  getFollowedAgentId(): number | null;
}

interface Instance {
  readonly model: Mat4;
  readonly tint: readonly [number, number, number, number];
}

/** Follow-cam's camera-target z offset above ground — matches the initial
 *  camera's own `target: [.., .., 1]` (roughly chest/head height on the
 *  64x64 grid's scale), so following doesn't suddenly point the camera at
 *  an agent's feet. */
const FOLLOW_EYE_HEIGHT = 1;

/** Boot the 3D town against `canvas`, fed by `worker`'s snapshot stream.
 *  Returns immediately (WebGPU device creation is async); the render loop
 *  starts once the device is ready. Safe to call `dispose()` before that
 *  resolves. */
export function startHollowApp(canvas: HTMLCanvasElement, worker: Worker, opts: HollowAppOptions): HollowApp {
  const snapshotBuffer = new SnapshotBuffer();
  let disposed = false;
  let cameraInput: CameraInputHandle | null = null;
  let rafHandle: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let resizeListener: (() => void) | null = null;
  let lastAgentRenderState: Map<number, AgentRenderState> | null = null;
  let lastViewProj: Mat4 | null = null;
  const facingTracker = new AgentFacingTracker();

  // Chunk hollow-09c: the picked-agent highlight + follow-cam state. Both
  // are plain client-side UI state (never fed into the sim, never affect
  // determinism) — see this file's `HollowApp.setSelectedAgent`/`setFollow`
  // doc.
  let selectedAgentId: number | null = null;
  let followAgentId: number | null = null;

  const onMessage = (event: MessageEvent<WorkerOutbound>): void => {
    const msg = event.data;
    if (msg.type === "snapshot") snapshotBuffer.ingest(msg.snapshot, performance.now());
  };
  worker.addEventListener("message", onMessage);

  void bootRenderer();

  async function bootRenderer(): Promise<void> {
    if (!navigator.gpu) {
      // eslint-disable-next-line no-console -- surfaced to the dev console;
      // there is no in-canvas HUD text path yet (09b's overlay owns that).
      console.error(
        "[hollow] WebGPU is not available in this browser. Open in a WebGPU-capable Chrome " +
          "(chrome://flags -> Unsafe WebGPU, or Chrome 113+ which ships it by default).",
      );
      return;
    }

    const device3d = await createDevice3d(canvas);
    if (disposed) return;

    const renderer = new SceneRenderer3D(device3d, {
      clearColor: [...toFloatRgb(HOLLOW_PAL.navy), 1] as [number, number, number, number],
    });

    // --- combined material table (hollow-09b): world keys + agent (skin/
    // hair/cloth) keys in ONE ordered list, ONE setMaterials call — see
    // materials.ts's header seam note. World-key indices are unaffected
    // (they occupy the SAME positions 0..WORLD_MATERIAL_KEYS.length-1 as
    // they would standalone, since agent keys are appended after, never
    // interleaved), so this single resolver replaces `worldMaterialIndexOf`
    // for every `uploadMesh` call below, world AND agent alike. ------------
    const combinedMaterialKeys = [...WORLD_MATERIAL_KEYS, ...AGENT_MATERIAL_KEYS];
    const combinedMaterialIndexOf = materialIndexMap(combinedMaterialKeys);
    renderer.setMaterials([...buildWorldMaterialList(), ...buildAgentMaterialList()]);

    // --- static meshes, uploaded ONCE (see materials.ts's header for why
    // the territory tint and resource nodes are instanced/scaled via the
    // model matrix rather than re-uploaded per tick) ---------------------
    const groundMesh = renderer.uploadMesh(buildGroundMesh(GRID_SIZE), combinedMaterialIndexOf);
    const territoryTileMesh = renderer.uploadMesh(buildTerritoryTileMesh(), combinedMaterialIndexOf);
    const foodNodeMesh = renderer.uploadMesh(baseNodeMeshFor("food"), combinedMaterialIndexOf);
    const materialNodeMesh = renderer.uploadMesh(baseNodeMeshFor("material"), combinedMaterialIndexOf);

    // Home meshes are grown lazily as new household member-counts are seen
    // (a small, bounded set — see household-layout.ts's `growthFactorFor`
    // clamp) and cached forever, never re-uploaded.
    const homeMeshByMemberCount = new Map<number, MeshHandle>();
    function homeMeshHandleFor(memberCount: number): MeshHandle {
      let handle = homeMeshByMemberCount.get(memberCount);
      if (!handle) {
        handle = renderer.uploadMesh(homeMeshFor(memberCount), combinedMaterialIndexOf);
        homeMeshByMemberCount.set(memberCount, handle);
      }
      return handle;
    }

    // A home's ground position is FROZEN on first sighting of its household
    // (keyed by household id). `householdLayout` re-derives an anchor from the
    // community territory centroid every frame, which JUMPS when a community
    // forms/splits/merges/dissolves or the household's community vote flips —
    // that jump is the "houses teleport" artifact. A dwelling is fixed: once
    // placed, it stays put for the life of the run.
    const homePosByHousehold = new Map<number, HouseholdPosition>();
    // The reserved footprint ("hitbox") of every home placed so far — new homes
    // are nudged outward from their community anchor until they clear these, so
    // houses never overlap (home-placement.ts). Each reserves its MAX-growth
    // footprint up front so growing a family never causes a late overlap.
    const placedHomeRects: Rect[] = [];

    // Agent humanoid mesh-variants (skin x hair x pose), memoized — each
    // distinct variant is built + uploaded exactly once (see humanoid.ts's
    // `VariantCache`/`variantKey` header). Cloth is a single fixed role
    // (`CLOTH_KEY`), so it doesn't multiply the variant count.
    const agentVariants = new VariantCache<{ readonly mesh: Mesh; readonly handle: MeshHandle }>();
    function agentVariantFor(skinKey: string, hairKey: string, pose: PoseKey): { mesh: Mesh; handle: MeshHandle } {
      return agentVariants.getOrBuild(variantKey(skinKey, hairKey, pose), () => {
        const mesh = buildHumanoid({ skinKey, hairKey, clothKey: CLOTH_KEY, pose });
        return { mesh, handle: renderer.uploadMesh(mesh, combinedMaterialIndexOf) };
      });
    }

    // --- camera: free orbit/pan/zoom god-cam, framed over the 64x64 town ---
    const camera = new OrbitCamera({
      target: [GRID_SIZE / 2, GRID_SIZE / 2, 1],
      distance: GRID_SIZE * 0.85,
      yaw: Math.PI / 4,
      pitch: Math.PI / 4,
      fovy: Math.PI / 3.2,
      near: 0.1,
      far: GRID_SIZE * 6,
      minPitch: 0.05,
      maxPitch: Math.PI / 2 - 0.05,
      minDistance: 4,
      maxDistance: GRID_SIZE * 3,
    });
    cameraInput = wireOrbitCameraInput(canvas, camera, {
      // Chunk hollow-09c: click-to-inspect's ray-pick, over the agent AABBs
      // the previous frame published (`lastAgentRenderState`) — the exact
      // `rayFromScreen`/`pickNearest` idiom `render3d-demo.ts` already
      // proves out. Sets the highlight immediately (no round trip needed
      // for that) and hands the pick off to the caller for the worker
      // "inspect" round trip + panel.
      onClick(sx, sy) {
        let pickedId: number | null = null;
        if (lastViewProj && lastAgentRenderState) {
          const rect = canvas.getBoundingClientRect();
          const ray = rayFromScreen(sx, sy, rect.width, rect.height, lastViewProj);
          const items = [...lastAgentRenderState.entries()].map(([id, state]) => ({
            bounds: state.bounds,
            value: id,
          }));
          pickedId = pickNearest(ray, items);
        }
        selectedAgentId = pickedId;
        opts.onAgentClicked?.(pickedId);
      },
      // A manual pan means the player wants to look elsewhere — cancel any
      // active follow-cam (see `setFollow`'s doc).
      onPan() {
        if (followAgentId !== null) {
          followAgentId = null;
          opts.onFollowCancelled?.();
        }
      },
    });

    // --- resize -----------------------------------------------------------
    function resize(): void {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        renderer.resize(width, height);
      }
    }
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(canvas);
    } else {
      resizeListener = resize;
      window.addEventListener("resize", resizeListener);
    }
    resize();

    // --- render loop --------------------------------------------------------
    function frame(nowMs: number): void {
      if (disposed) return;
      resize();

      const latest = snapshotBuffer.getLatest();
      if (latest) {
        const draws: DrawCall3d[] = [];

        // Ground (single instance — the heightfield mesh itself IS the terrain).
        draws.push({
          mesh: groundMesh,
          instances: packInstances([{ model: identity(), tint: WHITE_TINT }]),
          instanceCount: 1,
        });

        // Soft per-community territory tint — one tile-mesh instance per
        // {gx, gy} in every community's territory, tinted toward that
        // community's color role (materials.ts).
        const territoryInstances: Instance[] = [];
        for (const community of latest.communities) {
          const tint = territoryTintColor(community.id);
          for (const tile of community.territory) {
            const z = groundHeightAt(tile.gx, tile.gy) + TERRITORY_TINT_Z_OFFSET;
            territoryInstances.push({ model: translation([tile.gx, tile.gy, z]), tint });
          }
        }
        if (territoryInstances.length > 0) {
          draws.push({
            mesh: territoryTileMesh,
            instances: packInstances(territoryInstances),
            instanceCount: territoryInstances.length,
          });
        }

        // Households — clustered by community, sized by member count (see
        // household-layout.ts). Grouped by mesh handle so each distinct
        // house size gets exactly one instanced draw call.
        const memberCounts = householdMemberCounts(latest);
        const layout = householdLayout(latest);
        const byHomeMesh = new Map<MeshHandle, Instance[]>();
        for (const [householdId, freshPos] of layout) {
          // Freeze position on first sighting; reuse it forever (anti-teleport).
          // On first placement, nudge outward from the community anchor until
          // the home's footprint clears every already-placed home (anti-overlap).
          let pos = homePosByHousehold.get(householdId);
          if (!pos) {
            const { w, d } = MAX_HOME_FOOTPRINT;
            pos = findFreePlacement(freshPos, w, d, HOME_MARGIN, placedHomeRects);
            homePosByHousehold.set(householdId, pos);
            placedHomeRects.push(footprintRect(pos.x, pos.y, w, d, HOME_MARGIN));
          }
          const count = memberCounts.get(householdId) ?? 1;
          const handle = homeMeshHandleFor(count);
          const z = groundHeightAt(Math.round(pos.x), Math.round(pos.y));
          const inst: Instance = { model: translation([pos.x, pos.y, z]), tint: WHITE_TINT };
          const list = byHomeMesh.get(handle);
          if (list) list.push(inst);
          else byHomeMesh.set(handle, [inst]);
        }
        for (const [handle, list] of byHomeMesh) {
          draws.push({ mesh: handle, instances: packInstances(list), instanceCount: list.length });
        }

        // Resource nodes — distinct base mesh per kind, scaled per-instance
        // by current stock fullness (see node-mesh.ts's header for why the
        // scaling happens here, via the model matrix, rather than by
        // re-uploading geometry every tick).
        const foodInstances: Instance[] = [];
        const materialInstances: Instance[] = [];
        for (const node of latest.resourceNodes) {
          const s = fullnessScale(resourceNodeFullness(node.stock, node.maxStock));
          const z = groundHeightAt(node.gx, node.gy);
          const model = multiply(translation([node.gx + 0.5, node.gy + 0.5, z]), scaling([s, s, s]));
          const inst: Instance = { model, tint: WHITE_TINT };
          if (node.kind === "food") foodInstances.push(inst);
          else materialInstances.push(inst);
        }
        if (foodInstances.length > 0) {
          draws.push({ mesh: foodNodeMesh, instances: packInstances(foodInstances), instanceCount: foodInstances.length });
        }
        if (materialInstances.length > 0) {
          draws.push({
            mesh: materialNodeMesh,
            instances: packInstances(materialInstances),
            instanceCount: materialInstances.length,
          });
        }

        // ---------------------------------------------------------------
        // Agents (chunk hollow-09b) — gene-driven animated humanoids. Each
        // alive agent: interpolated grid position (interp.ts, never
        // extrapolated) -> render-clock facing/gait (agent-anim.ts) ->
        // mesh-variant lookup (skin x hair x pose, memoized above) ->
        // per-instance model matrix (world pos + terrain height + facing +
        // height/build genes + life-stage scale + walk bob). Grouped by
        // variant mesh handle so each distinct variant gets exactly one
        // instanced draw call, same idiom as the households/nodes above.
        //
        // SEAM for chunk hollow-09c: glyph/tag overlay + click-to-inspect
        // plug in HERE (after this block, still before `renderer.render`
        // below) — this block already publishes everything they need onto
        // `agentRenderState`/`viewProj` (returned by `getAgentRenderState()`/
        // `getViewProj()`, see this file's `HollowApp` interface): per-agent
        // `headWorld` (project through `viewProj` for on-screen glyph/tag
        // placement) and `bounds` (a world-space AABB — ray-test with
        // `rayFromScreen`/`pickNearest`, the exact idiom `render3d-demo.ts`
        // already proves out, for click-to-inspect). A selected-agent
        // highlight would multiply that agent's `tint` below by a highlight
        // factor before `packInstances` — same mechanism render3d-demo.ts
        // uses for its own picked-instance highlight (`PICKED_TINT`).
        // ---------------------------------------------------------------
        const agentPositions = snapshotBuffer.interpolatedAgentPositions(nowMs);

        // Follow-cam (chunk hollow-09c): re-target the camera to the
        // followed agent's INTERPOLATED position every frame, preserving
        // yaw/pitch/distance (only `target` is touched) — the player can
        // keep orbiting/zooming around it. Cancels itself if the followed
        // agent is no longer alive this frame (despawned — death, in
        // practice); a manual pan cancels it too (see the `onPan` callback
        // above).
        if (followAgentId !== null) {
          const followPos = agentPositions.get(followAgentId);
          if (followPos) {
            const z = groundHeightAt(Math.round(followPos.x), Math.round(followPos.y));
            camera.target = [followPos.x, followPos.y, z + FOLLOW_EYE_HEIGHT];
          } else {
            followAgentId = null;
            opts.onFollowCancelled?.();
          }
        }

        const agentRenderState = new Map<number, AgentRenderState>();
        const byAgentVariant = new Map<MeshHandle, Instance[]>();
        const aliveAgentIds = new Set<number>();

        for (const agent of latest.agents) {
          const pos = agentPositions.get(agent.id);
          if (!pos) continue; // defensive — positions are built from latest.agents itself
          aliveAgentIds.add(agent.id);

          const { facing, moving } = facingTracker.update(agent.id, pos);
          const pose = poseForAgent(agent.action, moving, nowMs, agent.id);
          const variant = agentVariantFor(agent.appearance.skinTone, agent.appearance.hairTone, pose);

          const groundZ = groundHeightAt(Math.round(pos.x), Math.round(pos.y));
          const bob = moving || agent.action === "walk" ? walkBob(nowMs, agent.id) : 0;
          const model = agentModelMatrix({
            pos,
            groundZ,
            facing,
            heightGene: agent.appearance.height,
            buildGene: agent.appearance.build,
            stageScale: stageScale(agent.stage),
            bobOffset: bob,
          });

          // Picked-agent highlight (chunk hollow-09c seam) — same tint-
          // multiply mechanism `render3d-demo.ts`'s `PICKED_TINT` uses, see
          // `selection.ts`'s header.
          const baseTint = humanoidTint(agent.id);
          const tint = agent.id === selectedAgentId ? selectedTint(baseTint) : baseTint;
          const inst: Instance = { model, tint };
          const list = byAgentVariant.get(variant.handle);
          if (list) list.push(inst);
          else byAgentVariant.set(variant.handle, [inst]);

          agentRenderState.set(agent.id, {
            headWorld: transformPoint(model, HEAD_TOP_LOCAL),
            model,
            bounds: instanceAABB(variant.mesh, model),
          });
        }
        facingTracker.prune(aliveAgentIds);
        for (const [handle, list] of byAgentVariant) {
          draws.push({ mesh: handle, instances: packInstances(list), instanceCount: list.length });
        }
        lastAgentRenderState = agentRenderState;

        const tickEstimate = snapshotBuffer.interpolatedTick(nowMs);
        // Visual day/night runs on RENDER_DAY_TICKS (a long cosmetic period),
        // NOT the sim's compressed `ticksPerDay` — see day-night.ts's header.
        const dayNight = dayNightFromPhase(dayNightPhase(tickEstimate, RENDER_DAY_TICKS));
        const aspect = canvas.width / Math.max(1, canvas.height);
        const viewProj = multiply(camera.projMatrix(aspect), camera.viewMatrix());
        lastViewProj = viewProj;

        renderer.render({
          viewProj,
          sunDir: dayNight.sunDir,
          dayNight: dayNight.dayNight,
          ambient: dayNight.ambient,
          time: nowMs / 1000,
          draws,
        });
      }

      rafHandle = requestAnimationFrame(frame);
    }
    rafHandle = requestAnimationFrame(frame);
  }

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      worker.removeEventListener("message", onMessage);
      cameraInput?.dispose();
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      resizeObserver?.disconnect();
      if (resizeListener) window.removeEventListener("resize", resizeListener);
    },
    getAgentRenderState(): ReadonlyMap<number, AgentRenderState> | null {
      return lastAgentRenderState;
    },
    getViewProj(): Mat4 | null {
      return lastViewProj;
    },
    setSelectedAgent(agentId: number | null): void {
      selectedAgentId = agentId;
    },
    setFollow(agentId: number | null): void {
      followAgentId = agentId;
    },
    getFollowedAgentId(): number | null {
      return followAgentId;
    },
  };
}
