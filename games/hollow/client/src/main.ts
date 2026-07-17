/**
 * Hollow — browser entry point (chunk hollow-01 scaffolding).
 *
 * Boots the sim worker and renders a plain-text "Hollow — sim running, tick N"
 * readout — no canvas/renderer yet (later briefs add one, following the
 * Citadel precedent of an in-canvas @engine/ui HUD).
 */
import "./style.css";
import type { WorkerOutbound, WorkerInitMessage } from "./worker/sim-worker";

// Deterministic scaffolding seed — no gameplay depends on this yet, but every
// sim entry point threads a seed through from the start (determinism is
// load-bearing; see CLAUDE.md) rather than bolting it on once it matters.
const SEED = 0x1a1100;
const TICKS_PER_DAY = 20;

const app = document.getElementById("app");

function render(tick: number): void {
  if (app) app.textContent = `Hollow — sim running, tick ${tick}`;
}

render(0);

const worker = new Worker(new URL("./worker/sim-worker", import.meta.url), { type: "module" });

worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
  const msg = event.data;
  if (msg.type === "snapshot") render(msg.snapshot.tick);
};

const init: WorkerInitMessage = { type: "init", seed: SEED, ticksPerDay: TICKS_PER_DAY };
worker.postMessage(init);
