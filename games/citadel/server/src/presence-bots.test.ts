/**
 * Citadel 36 (presence/roster/emotes) + 37 (seeded lobby bots).
 *
 * 36: presence/emote are RELAYED, never enqueued into the command log (saves/
 * replay stay deterministic); the roster reflects present players. 37: seeded
 * bots join as peers and submit commands into the authoritative log — a bot-
 * filled match is reproducible from its seed.
 */
import { describe, it, expect } from "vitest";
import { CitadelSimHost } from "./sim-host";
import type { WorkerOutbound } from "@citadel/sim-core/snapshot";

describe("Citadel 36 — presence / roster / emotes (ephemeral, off-log)", () => {
  it("relays presence to others + emotes to all, never touching the command log", () => {
    const host = new CitadelSimHost({ worldWidth: 96, worldHeight: 96, enforceTerritory: false });
    const aMsgs: WorkerOutbound[] = [];
    const bMsgs: WorkerOutbound[] = [];
    const peerA = host.attach((m) => aMsgs.push(m));
    const peerB = host.attach((m) => bMsgs.push(m));
    host.handleInbound(peerA, { type: "init", seed: 1, ticksPerDay: 20 });

    const logLenBefore = host.simResult!.state.commandLog.length;

    host.handleInbound(peerA, { type: "presence", cursorX: 5, cursorY: 6, tool: "house" });
    host.handleInbound(peerA, { type: "emote", emote: "wave" });
    host.step();

    // B sees A's presence (relayed to OTHER peers) + emote (to everyone).
    expect(bMsgs.some((m) => m.type === "presence" && m.playerId === 0 && m.cursorX === 5)).toBe(true);
    expect(bMsgs.some((m) => m.type === "emote" && m.playerId === 0 && m.emote === "wave")).toBe(true);
    // A does NOT get its own presence echoed back.
    expect(aMsgs.some((m) => m.type === "presence")).toBe(false);

    // Log purity: presence/emote added NOTHING to the authoritative command log.
    expect(host.simResult!.state.commandLog.length).toBe(logLenBefore);

    // Roster broadcast lists both present players, both alive.
    const roster = [...aMsgs].reverse().find((m) => m.type === "roster");
    expect(roster && roster.type === "roster" && roster.players.length).toBe(2);
    expect(roster && roster.type === "roster" && roster.players.every((p) => p.alive)).toBe(true);
  });
});

describe("Citadel 37 — seeded lobby bots", () => {
  function runBots(botSeed: number): CitadelSimHost {
    const host = new CitadelSimHost({ worldWidth: 256, worldHeight: 256, enforceTerritory: false });
    const human = host.attach(() => {});
    host.handleInbound(human, { type: "init", seed: 99, ticksPerDay: 20 });
    host.addBot(botSeed);
    host.addBot(botSeed + 1);
    for (let t = 0; t < 60; t++) host.step();
    return host;
  }

  it("bots join as peers and submit commands into the authoritative log", () => {
    const host = runBots(7);
    const halls = [...host.simResult!.world.query("building")].filter((e) => e.building.type === "town-hall");
    // Both bots (players 1 and 2) placed their anchor.
    expect(halls.some((b) => b.building.ownerId === 1)).toBe(true);
    expect(halls.some((b) => b.building.ownerId === 2)).toBe(true);
    expect(host.simResult!.state.commandLog.length).toBeGreaterThan(0);
    // No privileged path: every logged command is an ordinary CitadelCommand.
    expect(host.simResult!.state.commandLog.every((e) => typeof e.command.type === "string")).toBe(true);
  });

  it("a bot-filled match is reproducible from its seed (identical command log)", () => {
    const a = runBots(7);
    const b = runBots(7);
    expect(JSON.stringify(b.simResult!.state.commandLog)).toBe(JSON.stringify(a.simResult!.state.commandLog));
  });
});
