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

const wss = new WebSocketServer({ port: PORT, perMessageDeflate: { threshold: 1024 } });
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
    host.handleInbound(peer, msg);
  });
  ws.on("close", () => host.detach(peer));
  ws.on("error", () => host.detach(peer));
});

const shutdown = (): void => {
  wss.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
