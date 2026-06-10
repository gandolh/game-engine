// Farm Valley sim server: one SimHost per connection; disconnect stops the sim (no leaks).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { WorkerInbound, WorkerOutbound } from "@farm/sim-core/protocol";
import { SimHost } from "./sim-host";

const PORT = Number(process.env["PORT"] ?? 8787);

// Backpressure: drop per-tick snapshots when bufferedAmount exceeds this; never drop static-layer/profile.
const MAX_BUFFERED_BYTES = 1_000_000;

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

  // permessage-deflate: ~70-80% size reduction on repetitive JSON snapshots; threshold skips tiny frames.
  const wss = new WebSocketServer({
    port: PORT,
    perMessageDeflate: { threshold: 1024 },
  });
  console.log(`[server] Farm Valley sim server listening on ws://localhost:${PORT}`);

  wss.on("connection", (ws: WebSocket) => {
    let dropped = 0;

    // setNoDelay: no-op for large frames today, but required before any small-frame codec (Nagle+ACK ≈ 40ms).
    // `_socket` is exposed by `ws` but absent from its public types — narrowed to avoid `any`.
    const rawSocket = (ws as { _socket?: { setNoDelay(b: boolean): void } })
      ._socket;
    rawSocket?.setNoDelay(true);

    const send = (msg: WorkerOutbound): void => {
      if (ws.readyState !== ws.OPEN) return;
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
