

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { SimRejectedMsg } from "@farm/sim-core/protocol";
import { SimHost } from "./sim-host";
import { validateInbound } from "./validate-inbound";
import { RunRegistry } from "./run-registry";
import type { ClientSocket } from "./run-registry";

const PORT = Number(process.env["PORT"] ?? 8787);

process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] uncaught exception:", err);
});

async function loadPathfinderWasm(): Promise<ArrayBuffer | null> {
  const here = dirname(fileURLToPath(import.meta.url));
  const wasmPath = resolve(
    here,
    "../../../../engine/wasm-modules/dist/pathfinding.wasm",
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
    maxPayload: 64 * 1024,
  });
  console.log(`[server] Farm Valley sim server listening on ws://localhost:${PORT}`);

  wss.on("connection", (ws: WebSocket) => {

    const rawSocket = (ws as { _socket?: { setNoDelay(b: boolean): void } })
      ._socket;
    rawSocket?.setNoDelay(true);

    const socket: ClientSocket = ws;

    const reject = (forType: string | null, code: string, message: string, field?: string): void => {
      if (ws.readyState !== ws.OPEN) return;
      const msg: SimRejectedMsg = { type: "rejected", forType, code, message };
      if (field !== undefined) msg.field = field;
      ws.send(JSON.stringify(msg));
    };

    ws.on("message", (data) => {
      // audit-42: ONE narrowing guard at the wire boundary, before anything reaches
      // `bootstrapSim` or the ECS. Nothing below this line may throw on hostile input — this
      // socket is publicly reachable, and a throw here surfaces as an `uncaughtException`.
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        reject(null, "not-json", "message must be JSON");
        return;
      }
      const result = validateInbound(parsed);
      if (!result.ok) {
        const forType =
          typeof parsed === "object" && parsed !== null && typeof (parsed as { type?: unknown }).type === "string"
            ? (parsed as { type: string }).type
            : null;
        reject(forType, result.error.code, result.error.message, result.error.field);
        return;
      }
      const refusal = registry.handleControl(socket, result.msg);
      if (refusal !== null) reject(result.msg.type, refusal.code, refusal.message);
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
