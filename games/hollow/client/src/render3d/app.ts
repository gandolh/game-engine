/**
 * Hollow's cozy 3D town app shell (chunk hollow-09a) — the render loop that
 * reads the Worker's `HollowSnapshot` stream and draws the town: ground with
 * gentle terrain relief, soft per-community territory tints, households
 * (clustered by community, sized by family), and distinct resource-node
 * meshes. A free orbit/pan/zoom camera and a sim-clock-driven day/night wash
 * round it out. Agents (animated humanoids), glyph/tag overlays, and
 * click-to-inspect are chunk hollow-09b's job — see the clearly marked SEAM
 * comment inside `frame()` below for exactly where that plugs in.
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
  multiply,
  translation,
  scaling,
  identity,
  type Mat4,
  type MeshHandle,
  type DrawCall3d,
} from "@engine/core/render3d";
import type { WorkerOutbound } from "../worker/sim-worker";
import { HOLLOW_PAL } from "../render/hollow-palette";
import { GRID_SIZE } from "@hollow/sim-core/world";
import { SnapshotBuffer } from "./interp";
import { groundHeightAt } from "./terrain";
import { buildGroundMesh, buildTerritoryTileMesh, TERRITORY_TINT_Z_OFFSET } from "./world-meshes";
import { householdLayout, householdMemberCounts, homeMeshFor } from "./household-layout";
import { baseNodeMeshFor, fullnessScale, resourceNodeFullness } from "./node-mesh";
import { dayNightPhase, dayNightFromPhase } from "./day-night";
import { wireOrbitCameraInput, type CameraInputHandle } from "./camera-input";
import { buildWorldMaterialList, worldMaterialIndexOf, territoryTintColor, toFloatRgb, WHITE_TINT } from "./materials";

export interface HollowAppOptions {
  /** Must match the seed the worker was `init`ed with (only used here to
   *  derive the day/night phase — see day-night.ts). */
  readonly ticksPerDay: number;
}

export interface HollowApp {
  /** Tears down listeners/observers/the render loop. Idempotent. */
  dispose(): void;
}

interface Instance {
  readonly model: Mat4;
  readonly tint: readonly [number, number, number, number];
}

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
    renderer.setMaterials(buildWorldMaterialList());

    // --- static meshes, uploaded ONCE (see materials.ts's header for why
    // the territory tint and resource nodes are instanced/scaled via the
    // model matrix rather than re-uploaded per tick) ---------------------
    const groundMesh = renderer.uploadMesh(buildGroundMesh(GRID_SIZE), worldMaterialIndexOf);
    const territoryTileMesh = renderer.uploadMesh(buildTerritoryTileMesh(), worldMaterialIndexOf);
    const foodNodeMesh = renderer.uploadMesh(baseNodeMeshFor("food"), worldMaterialIndexOf);
    const materialNodeMesh = renderer.uploadMesh(baseNodeMeshFor("material"), worldMaterialIndexOf);

    // Home meshes are grown lazily as new household member-counts are seen
    // (a small, bounded set — see household-layout.ts's `growthFactorFor`
    // clamp) and cached forever, never re-uploaded.
    const homeMeshByMemberCount = new Map<number, MeshHandle>();
    function homeMeshHandleFor(memberCount: number): MeshHandle {
      let handle = homeMeshByMemberCount.get(memberCount);
      if (!handle) {
        handle = renderer.uploadMesh(homeMeshFor(memberCount), worldMaterialIndexOf);
        homeMeshByMemberCount.set(memberCount, handle);
      }
      return handle;
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
    cameraInput = wireOrbitCameraInput(canvas, camera);

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
        for (const [householdId, pos] of layout) {
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
        // SEAM for chunk hollow-09b — agent humanoid draws + glyph/tag
        // overlay + inspect panel plug in HERE, after the world draws above
        // and before `renderer.render(frame)` below. Reuse:
        //   - `snapshotBuffer.interpolatedAgentPositions(nowMs)` (interp.ts)
        //     for smooth per-agent grid positions (never extrapolated);
        //   - `latest.agents[i].action` for the coarse pose/verb label
        //     (@hollow/sim-core's `HollowAgentSnapshot.action` — vocabulary:
        //     "idle" | "walk" | "eat" | "work" | "rest" | "gift" | "share" |
        //     "help" | "teach" | "trade" | "steal" | "sabotage" | "rumor" |
        //     "attack" — see sim-bootstrap.ts's doc comment on that field);
        //   - a SECOND ordered material-key list (skin/hair/clothing tones)
        //     + its own `materialIndexMap`, built the same way this file's
        //     `worldMaterialIndexOf` is (see materials.ts's header seam
        //     note) — push agent draws into this same `draws` array;
        //   - `rayFromScreen`/`pickNearest`/`instanceAABB` (already proven
        //     out end-to-end in render3d-demo.ts) for click-to-inspect.
        // ---------------------------------------------------------------

        const tickEstimate = snapshotBuffer.interpolatedTick(nowMs);
        const dayNight = dayNightFromPhase(dayNightPhase(tickEstimate, opts.ticksPerDay));
        const aspect = canvas.width / Math.max(1, canvas.height);
        const viewProj = multiply(camera.projMatrix(aspect), camera.viewMatrix());

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
  };
}
