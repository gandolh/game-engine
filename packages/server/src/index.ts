/**
 * index.ts — the Farm Valley sim server entrypoint.
 *
 * A WebSocket server (the `ws` library; Node has a WS client but no server). Each
 * connection owns ONE sim run: on connect we create a SimHost, on each inbound
 * message we forward it to the host, and on close we stop the host (so a
 * disconnect never leaks a ticking sim). Snapshots stream out as JSON.
 *
 * The host loop + sim are deterministic and depend only on the tick count, so a
 * given seed produces byte-identical output to the browser worker (both use the
 * WASM pathfinder).
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { WorkerInbound, WorkerOutbound } from "@farm/sim-core/protocol";
import { SimHost } from "./sim-host";

const PORT = Number(process.env["PORT"] ?? 8787);

/**
 * Backpressure: if a client falls behind, the socket's buffered byte count
 * climbs. For a watch-only sim it is correct to DROP intermediate snapshots
 * rather than queue unboundedly (the client interpolates across gaps). We never
 * drop static-layer / profile messages — only per-tick snapshots, which are the
 * high-frequency stream. ~1 MB ≈ several uncompressed snapshots in flight.
 */
const MAX_BUFFERED_BYTES = 1_000_000;

/** Load the WASM pathfinder bytes once at startup; reused for every connection. */
async function loadPathfinderWasm(): Promise<ArrayBuffer | null> {
  const here = dirname(fileURLToPath(import.meta.url));
  const wasmPath = resolve(
    here,
    "../../wasm-modules/dist/pathfinding.wasm",
  );
  try {
    const buf = await readFile(wasmPath);
    return buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  } catch (e) {
    console.warn(
      `[server] could not read pathfinding.wasm at ${wasmPath} — farmers will not travel ` +
        `(run \`npm run build-wasm\`). Behavior will DIFFER from the browser. ${e}`,
    );
    return null;
  }
}

async function main(): Promise<void> {
  const pathfinderWasm = await loadPathfinderWasm();

  const wss = new WebSocketServer({ port: PORT });
  console.log(`[server] Farm Valley sim server listening on ws://localhost:${PORT}`);

  wss.on("connection", (ws: WebSocket) => {
    let dropped = 0;

    const send = (msg: WorkerOutbound): void => {
      if (ws.readyState !== ws.OPEN) return;
      // Drop-stale: skip per-tick snapshots when the send buffer is backed up.
      // Always deliver static-layer/profile (low-frequency, correctness-relevant).
      if (msg.type === "snapshot" && ws.bufferedAmount > MAX_BUFFERED_BYTES) {
        dropped += 1;
        if (dropped % 60 === 0) {
          console.warn(
            `[server] client slow: dropped ${dropped} snapshots (buffered=${ws.bufferedAmount}B)`,
          );
        }
        return;
      }
      ws.send(JSON.stringify(msg));
    };

    const host = new SimHost(send, { pathfinderWasm });

    ws.on("message", (data) => {
      let msg: WorkerInbound;
      try {
        msg = JSON.parse(data.toString()) as WorkerInbound;
      } catch {
        console.warn("[server] ignoring non-JSON message from client");
        return;
      }
      host.handleInbound(msg);
    });

    ws.on("close", () => host.stop());
    ws.on("error", () => host.stop());
  });

  const shutdown = (): void => {
    console.log("[server] shutting down");
    wss.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
