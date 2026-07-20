/**
 * Hollow — browser entry point (chunk hollow-09a).
 *
 * Boots the sim worker and the cozy 3D town app shell (`render3d/app.ts`)
 * against the `#scene` canvas. See `render3d/app.ts`'s header for the
 * render loop itself (world geometry, camera, day/night, and the seam
 * where chunk hollow-09b's agent humanoids + inspect overlay plug in) —
 * this file only owns the Worker's lifecycle and wires it to the app.
 */
import "./style.css";
import type { WorkerInitMessage } from "./worker/sim-worker";
import { startHollowApp } from "./render3d/app";

// Deterministic seed — every sim entry point threads one through from the
// start (determinism is load-bearing; see CLAUDE.md), even though nothing
// here reads it beyond passing it to the worker.
const SEED = 0x1a1100;
const TICKS_PER_DAY = 20;

const canvas = document.getElementById("scene");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("hollow: #scene canvas missing from index.html");
}

const worker = new Worker(new URL("./worker/sim-worker", import.meta.url), { type: "module" });

// Kept alive for the page's lifetime — a fresh page load owns the whole
// app/worker pair, so nothing calls `.dispose()` today. It exists on
// `HollowApp` for a future dev-hot-reload teardown hook (and so tests/tools
// that DO want to tear an instance down have something to call).
startHollowApp(canvas, worker, { ticksPerDay: TICKS_PER_DAY });

const init: WorkerInitMessage = { type: "init", seed: SEED, ticksPerDay: TICKS_PER_DAY };
worker.postMessage(init);
