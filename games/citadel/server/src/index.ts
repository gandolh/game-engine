/**
 * @citadel/server entrypoint (Citadel 35).
 *
 * One authoritative multi-writer room per server process (a multi-room lobby is
 * a follow-up). Every WebSocket peer joins the room, is assigned a player id, and
 * may submit commands; the host stamps them into the one command stream, advances
 * the single sim in real time, and fans out per-peer snapshots.
 */
import { WebSocketServer, type WebSocket } from "ws";
import type { WorkerInbound } from "@citadel/sim-core/snapshot";
import { CitadelSimHost, type Peer } from "./sim-host";

const PORT = Number(process.env["PORT"] ?? 8788); // Farm server uses 8787; Citadel 8788.

const host = new CitadelSimHost({
  worldWidth: 256,
  worldHeight: 256,
  enforceTerritory: true,
  realtime: true,
  tickRateHz: 20,
});

// audit-43: process-level handlers, matching Farm's. Without them one throw anywhere off the
// request path takes the whole server down; `step()` now guards the tick itself.
process.on("unhandledRejection", (reason) => {
  console.error("[citadel-server] unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[citadel-server] uncaught exception:", err);
});

const wss = new WebSocketServer({
  port: PORT,
  perMessageDeflate: { threshold: 1024 },
  // audit-43: `ws` defaults to 100 MB. Farm sets 64 KB; Citadel is the copy that dropped it.
  // Combined with `placeRoad`/`placeWall` looping a caller-supplied tile list, a single frame
  // controlled how much work a tick did — the tile list is separately capped in the host.
  maxPayload: 64 * 1024,
});
console.log(`[citadel-server] multi-writer sim room listening on ws://localhost:${PORT}`);

wss.on("connection", (ws: WebSocket) => {
  (ws as { _socket?: { setNoDelay(b: boolean): void } })._socket?.setNoDelay(true);
  const peer: Peer = host.attach((msg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  });
  ws.on("message", (data) => {
    let msg: WorkerInbound;
    try {
      msg = JSON.parse(data.toString()) as WorkerInbound;
    } catch {
      return;
    }
    // audit-43: shape guard. `handleInbound` switches on `msg.type`, which a `null` frame
    // dereferences. Field-level validation is NOT added here — that is Farm's `validate-inbound.ts`
    // (audit-42) and porting it is a revival precondition, recorded in wiki/citadel-mp-deprecated.md.
    if (typeof msg !== "object" || msg === null || typeof (msg as { type?: unknown }).type !== "string") {
      return;
    }
    try {
      host.handleInbound(peer, msg);
    } catch (err) {
      console.error("[citadel-server] handleInbound threw; dropping the frame", err);
    }
  });
  ws.on("close", () => host.detach(peer));
  ws.on("error", () => host.detach(peer));
});

const shutdown = (): void => {
  wss.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
