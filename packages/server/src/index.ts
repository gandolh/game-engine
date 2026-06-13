

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { WorkerInbound } from "@farm/sim-core/protocol";
import { SimHost } from "./sim-host";
import { RunRegistry } from "./run-registry";
import type { ClientSocket } from "./run-registry";

const PORT = Number(process.env["PORT"] ?? 8787);

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

  const registry = new RunRegistry((send, _init) => new SimHost(send, { pathfinderWasm }));

  const wss = new WebSocketServer({
    port: PORT,
    perMessageDeflate: { threshold: 1024 },
  });
  console.log(`[server] Farm Valley sim server listening on ws://localhost:${PORT}`);

  wss.on("connection", (ws: WebSocket) => {

    const rawSocket = (ws as { _socket?: { setNoDelay(b: boolean): void } })
      ._socket;
    rawSocket?.setNoDelay(true);

    const socket: ClientSocket = ws;

    ws.on("message", (data) => {
      let msg: WorkerInbound;
      try {
        msg = JSON.parse(data.toString()) as WorkerInbound;
      } catch {
        console.warn("[server] ignoring non-JSON message from client");
        return;
      }
      registry.handleControl(socket, msg);
    });

    ws.on("close", () => registry.detach(socket));
    ws.on("error", () => registry.detach(socket));
  });

  const shutdown = (): void => {
    console.log("[server] shutting down");
    wss.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
