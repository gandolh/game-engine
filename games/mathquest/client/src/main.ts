/**
 * MateQuest — browser entry point (M0 scaffold).
 *
 * Boots the sim worker (`src/worker/sim-worker.ts`) and a minimal in-canvas
 * `@engine/ui` render loop over a plain Canvas2D renderer (explicitly
 * requesting the `"canvas2d"` backend — no WebGPU adapter probing; this is a
 * skeleton with no gameplay yet, and Canvas2D needs nothing beyond a 2D
 * context). Draws the title "MateQuest — Cetatea Cifrelor" plus a
 * live-incrementing tick count read off the worker's snapshots, proving the
 * worker↔main↔render wiring end to end. No gameplay yet — see
 * corpus/wiki/mathquest-overview.md and the M0 brief
 * (corpus/todos/2026-07-21-mathquest-M0-scaffold.md) for what M1+ adds.
 *
 * Sim/render boundary (root CLAUDE.md): this file only ever reads
 * `MathquestSnapshot`s off `worker`'s `message` events — nothing here
 * mutates sim state.
 */
import "./style.css";
import { Camera2D, createRenderer, type RendererLike } from "@engine/core";
import { UISurface, loadFontAtlas, box, label, computeLayout, renderTree } from "@engine/ui";
import type { LabelNode } from "@engine/ui";
import { MATE_PAL } from "./render/mate-palette";
import type { WorkerInitMessage, WorkerOutbound } from "./worker/sim-worker";

// M0 has no persona/setup screen yet — a fixed seed is enough to prove the
// deterministic-seed seam is wired through the worker.
const SEED = 1;

const canvasRaw = document.getElementById("scene");
if (!(canvasRaw instanceof HTMLCanvasElement)) {
  throw new Error("mathquest: #scene canvas missing from index.html");
}
const canvas: HTMLCanvasElement = canvasRaw;

// Palette-sourced page chrome (CSS can't import MATE_PAL — see style.css's
// header; setting these from TS instead of a CSS hex literal keeps every
// color on the palette-purity contract, root CLAUDE.md).
document.body.style.background = MATE_PAL.black;
document.body.style.color = MATE_PAL.cream;

async function main(): Promise<void> {
  // A world camera is required by `Camera2D`/`RendererLike` even though this
  // M0 scaffold draws no world sprites — only the screen-space UI layer
  // (unaffected by the camera) is used below.
  const camera = new Camera2D({ worldUnitsX: 960, worldUnitsY: 540, centerX: 480, centerY: 270 });
  const renderer: RendererLike = await createRenderer(canvas, camera, { backend: "canvas2d" });
  renderer.clearColor = MATE_PAL.black;
  renderer.addAtlas(await loadFontAtlas());
  const surface = new UISurface(renderer);

  const titleLabel: LabelNode = label("MateQuest — Cetatea Cifrelor", {
    color: MATE_PAL.gold,
    scale: 2,
  });
  const tickLabel: LabelNode = label("tick: 0", { color: MATE_PAL.cream });
  const root = box({ direction: "column", gap: 8 }, [titleLabel, tickLabel]);

  const worker = new Worker(new URL("./worker/sim-worker", import.meta.url), { type: "module" });
  const init: WorkerInitMessage = { type: "init", seed: SEED };
  worker.postMessage(init);

  worker.addEventListener("message", (event: MessageEvent<WorkerOutbound>) => {
    const msg = event.data;
    if (msg.type === "snapshot") {
      tickLabel.text = `tick: ${msg.snapshot.tick}`;
    }
  });

  function frame(): void {
    renderer.beginFrame();
    computeLayout(root, 24, 24);
    surface.begin();
    renderTree(surface, root);
    surface.end();
    renderer.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

void main();
