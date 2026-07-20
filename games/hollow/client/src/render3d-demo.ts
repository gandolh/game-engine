/**
 * Standalone smoke-test harness for the 08b WebGPU 3D render layer
 * (@engine/core/render3d). NOT wired into main.ts / the sim worker — open
 * render3d-demo.html directly (see the "demo3d" package script) in a
 * WebGPU-capable Chrome to exercise this end to end.
 *
 * Builds a small deterministic village from engine primitives (ground,
 * houses = box + gable roof + an emissive window quad, a cylinder well, and
 * a handful of stand-in "agent" boxes), instances them through
 * SceneRenderer3D, wires an OrbitCamera to mouse drag/wheel, and resolves
 * clicks to a picked instance via rayFromScreen + pickNearest over each
 * instance's world-space AABB (instanceAABB) — proving the pure render3d
 * core (geometry/mat4/camera3d/pick) and the new WebGPU packing/orchestration
 * work together, without ever needing Math.random or a sim tick (all motion
 * here is render/wall-clock only, via performance.now()).
 */
import { rgbOf } from "@engine/core/render";
import {
  box,
  cylinder,
  gable,
  quad,
  merge,
  translate,
  createDevice3d,
  SceneRenderer3D,
  OrbitCamera,
  materialIndexMap,
  packInstances,
  instanceAABB,
  rayFromScreen,
  pickNearest,
  multiply,
  translation,
  rotationZ,
  identity,
  type Mesh,
  type Material,
  type Mat4,
  type Vec3,
  type MeshHandle,
  type DrawCall3d,
} from "@engine/core/render3d";
import { HOLLOW_PAL } from "./render/hollow-palette";

// ---------------------------------------------------------------------------
// Palette-resolved materials (no raw hex anywhere below — every color comes
// from a HOLLOW_PAL.* role, converted from the palette's 0..255 hex-derived
// ints to the 0..1 floats the engine's generic `Material.color` expects).
// ---------------------------------------------------------------------------

function toFloatRgb(hex: string): Vec3 {
  const [r, g, b] = rgbOf(hex);
  return [r / 255, g / 255, b / 255];
}

const MATERIAL_KEYS = ["grass", "wood", "rust", "stone", "skin", "glow"] as const;
type MaterialKey = (typeof MATERIAL_KEYS)[number];

const MATERIALS: Record<MaterialKey, Material> = {
  grass: { color: toFloatRgb(HOLLOW_PAL.green) },
  wood: { color: toFloatRgb(HOLLOW_PAL.wood) },
  rust: { color: toFloatRgb(HOLLOW_PAL.rust) },
  stone: { color: toFloatRgb(HOLLOW_PAL.steel) },
  skin: { color: toFloatRgb(HOLLOW_PAL.skin) },
  glow: { color: toFloatRgb(HOLLOW_PAL.gold), emissive: true },
};

const materialIndexOf = materialIndexMap([...MATERIAL_KEYS]);

// ---------------------------------------------------------------------------
// Deterministic scene geometry, built from @engine/core/render3d primitives.
// ---------------------------------------------------------------------------

const GROUND_SIZE = 40;
const GROUND_THICKNESS = 1;

function buildGroundMesh(): Mesh {
  return translate(box([GROUND_SIZE, GROUND_SIZE, GROUND_THICKNESS], "grass"), [
    -GROUND_SIZE / 2,
    -GROUND_SIZE / 2,
    -GROUND_THICKNESS,
  ]);
}

const HOUSE_W = 4;
const HOUSE_D = 3;
const HOUSE_WALL_H = 3;
const HOUSE_ROOF_H = 1.6;

function buildHouseMesh(): Mesh {
  const walls = box([HOUSE_W, HOUSE_D, HOUSE_WALL_H], "wood");
  const roof = translate(gable([HOUSE_W, HOUSE_D, HOUSE_ROOF_H], "x", "rust"), [0, 0, HOUSE_WALL_H]);

  // A small glowing window on the house's -y wall face, offset slightly
  // outward (eps) so its quad doesn't z-fight with the wall face beneath it.
  const windowSize = 0.6;
  const eps = 0.02;
  const wx = HOUSE_W / 2 - windowSize / 2;
  const wz = HOUSE_WALL_H / 2 - windowSize / 2;
  const window = quad(
    [wx, -eps, wz],
    [wx + windowSize, -eps, wz],
    [wx + windowSize, -eps, wz + windowSize],
    [wx, -eps, wz + windowSize],
    "glow",
  );

  return merge(walls, roof, window);
}

function buildWellMesh(): Mesh {
  return cylinder(1, 1.4, 12, "stone");
}

function buildAgentMesh(): Mesh {
  return box([0.5, 0.5, 1.0], "skin");
}

// ---------------------------------------------------------------------------
// Scene instances: a handful of houses ringing a central well, plus a few
// stand-in "agent" boxes. Deterministic layout — no RNG needed for a demo.
// ---------------------------------------------------------------------------

interface SceneInstance {
  readonly label: string;
  readonly meshData: Mesh;
  readonly mesh: MeshHandle;
  readonly model: Mat4;
  readonly baseTint: readonly [number, number, number, number];
}

const HOUSE_LAYOUT: readonly { pos: readonly [number, number]; yaw: number }[] = [
  { pos: [-7, -6], yaw: 0 },
  { pos: [7, -6], yaw: -Math.PI / 2 },
  { pos: [-7, 6], yaw: Math.PI / 2 },
  { pos: [7, 6], yaw: Math.PI },
];

const AGENT_LAYOUT: readonly [number, number][] = [
  [-2, -2],
  [2, -1.5],
  [-1, 2.5],
  [3, 3],
  [0, 0.5],
  [-4, 1],
];

const WHITE_TINT: readonly [number, number, number, number] = [1, 1, 1, 1];
const PICKED_TINT: readonly [number, number, number, number] = [1.4, 1.4, 1.05, 1];

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const canvasEl = document.getElementById("scene");
  const hud = document.getElementById("hud");
  if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error("render3d-demo: #scene canvas missing");
  // Re-bound to a concretely-typed const: control-flow narrowing from the
  // `instanceof` guard above does not survive into the nested `function
  // resize()`/`function frame()` declarations below (they could in principle
  // run before this line, so TS conservatively widens `canvasEl` back to
  // `HTMLElement | null` inside them) — `canvas` here has the narrowed type
  // baked in from its own declaration instead.
  const canvas: HTMLCanvasElement = canvasEl;

  // Background + HUD text colors, sourced from HOLLOW_PAL (not raw hex).
  document.body.style.background = HOLLOW_PAL.ink;
  if (hud) hud.style.color = HOLLOW_PAL.cream;

  if (!navigator.gpu) {
    if (hud) {
      hud.textContent =
        "WebGPU is not available in this browser.\n" +
        "Open in a WebGPU-capable Chrome (chrome://flags -> Unsafe WebGPU, " +
        "or Chrome 113+ which ships it by default).";
    }
    return;
  }

  const device3d = await createDevice3d(canvas);
  const renderer = new SceneRenderer3D(device3d, {
    clearColor: [...toFloatRgb(HOLLOW_PAL.navy), 1],
  });
  renderer.setMaterials(MATERIAL_KEYS.map((k) => MATERIALS[k]));

  const groundMeshData = buildGroundMesh();
  const houseMeshData = buildHouseMesh();
  const wellMeshData = buildWellMesh();
  const agentMeshData = buildAgentMesh();

  const groundMesh = renderer.uploadMesh(groundMeshData, materialIndexOf);
  const houseMesh = renderer.uploadMesh(houseMeshData, materialIndexOf);
  const wellMesh = renderer.uploadMesh(wellMeshData, materialIndexOf);
  const agentMesh = renderer.uploadMesh(agentMeshData, materialIndexOf);

  const instances: SceneInstance[] = [];

  instances.push({
    label: "ground",
    meshData: groundMeshData,
    mesh: groundMesh,
    model: identity(),
    baseTint: WHITE_TINT,
  });

  instances.push({
    label: "well",
    meshData: wellMeshData,
    mesh: wellMesh,
    model: identity(),
    baseTint: WHITE_TINT,
  });

  HOUSE_LAYOUT.forEach((h, i) => {
    instances.push({
      label: `house-${i}`,
      meshData: houseMeshData,
      mesh: houseMesh,
      model: multiply(translation([h.pos[0], h.pos[1], 0]), rotationZ(h.yaw)),
      baseTint: WHITE_TINT,
    });
  });

  AGENT_LAYOUT.forEach((pos, i) => {
    instances.push({
      label: `agent-${i}`,
      meshData: agentMeshData,
      mesh: agentMesh,
      model: translation([pos[0], pos[1], 0]),
      baseTint: WHITE_TINT,
    });
  });

  let pickedLabel: string | null = null;

  // -------------------------------------------------------------------
  // Camera: orbit (drag) / pan (shift-drag or right-drag) / zoom (wheel).
  // -------------------------------------------------------------------
  const camera = new OrbitCamera({
    target: [0, 0, 1],
    distance: 26,
    yaw: Math.PI / 4,
    pitch: Math.PI / 5,
    fovy: Math.PI / 3.2,
    near: 0.1,
    far: 300,
    minPitch: 0.05,
    maxPitch: Math.PI / 2 - 0.05,
    minDistance: 4,
    maxDistance: 80,
  });

  let dragButton: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let dragDistance = 0;

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("pointerdown", (e) => {
    dragButton = e.button;
    lastX = e.clientX;
    lastY = e.clientY;
    dragDistance = 0;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (dragButton === null) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    dragDistance += Math.abs(dx) + Math.abs(dy);

    const isPan = dragButton === 2 || e.shiftKey;
    if (isPan) {
      const panScale = camera.distance * 0.0015;
      camera.pan(-dx * panScale, dy * panScale);
    } else {
      camera.orbit(-dx * 0.005, dy * 0.005);
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    const wasClick = dragButton !== null && dragDistance < 4;
    dragButton = null;
    canvas.releasePointerCapture(e.pointerId);
    if (!wasClick) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const aspect = rect.width / Math.max(1, rect.height);
    const viewProj = multiply(camera.projMatrix(aspect), camera.viewMatrix());
    const ray = rayFromScreen(sx, sy, rect.width, rect.height, viewProj);

    const pickItems = instances
      .filter((inst) => inst.label !== "ground")
      .map((inst) => ({ bounds: instanceAABB(inst.meshData, inst.model), value: inst.label }));
    const picked = pickNearest(ray, pickItems);
    pickedLabel = picked;
    // eslint-disable-next-line no-console -- the brief's smoke-test contract:
    // click-to-inspect proves out by logging + highlighting the pick.
    console.log(`[render3d-demo] picked: ${picked ?? "(none)"}`);
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      camera.zoom(Math.exp(e.deltaY * 0.001));
    },
    { passive: false },
  );

  // -------------------------------------------------------------------
  // Resize
  // -------------------------------------------------------------------
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
  window.addEventListener("resize", resize);
  resize();

  // -------------------------------------------------------------------
  // Render loop — day/night oscillation on the RENDER clock only
  // (performance.now()), never a sim tick.
  // -------------------------------------------------------------------
  const DAY_PERIOD_MS = 24000;
  const SUN_DIR: Vec3 = [0.4, 0.55, 0.75];

  function frame(nowMs: number): void {
    resize();

    const phase = (nowMs % DAY_PERIOD_MS) / DAY_PERIOD_MS;
    const dayNight = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);

    const aspect = canvas.width / Math.max(1, canvas.height);
    const viewProj = multiply(camera.projMatrix(aspect), camera.viewMatrix());

    // Group instances by mesh so each distinct mesh gets exactly one
    // instanced draw call, per the renderer's contract.
    const byMesh = new Map<MeshHandle, SceneInstance[]>();
    for (const inst of instances) {
      const list = byMesh.get(inst.mesh);
      if (list) list.push(inst);
      else byMesh.set(inst.mesh, [inst]);
    }

    const draws: DrawCall3d[] = [];
    for (const [mesh, list] of byMesh) {
      const packed = packInstances(
        list.map((inst) => ({
          model: inst.model,
          tint: inst.label === pickedLabel ? PICKED_TINT : inst.baseTint,
        })),
      );
      draws.push({ mesh, instances: packed, instanceCount: list.length });
    }

    renderer.render({
      viewProj,
      sunDir: SUN_DIR,
      dayNight,
      ambient: 0.28,
      time: nowMs / 1000,
      draws,
    });

    if (hud) {
      hud.textContent =
        `Hollow render3d demo — drag orbit, shift/right-drag pan, wheel zoom, click to pick\n` +
        `dayNight=${dayNight.toFixed(2)}  picked=${pickedLabel ?? "(none)"}`;
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  console.error("[render3d-demo] fatal:", err);
  const hud = document.getElementById("hud");
  if (hud) hud.textContent = `render3d-demo failed: ${String(err)}`;
});
