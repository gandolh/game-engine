import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import type { GameEntity } from "../../../components";
import { zeroFish, FISH_VALUE } from "../../../components";
import { MessageBus } from "@engine/core";
import { handleBoardBoat, handleFishCoral, handleReturnToShore } from "./coral";
import { CORAL_REEFS } from "../../../world/coral";
import { PORTS } from "../../../world/ports";
import type { ActingFarmer } from "../types";

function makeFarmer(over: Partial<GameEntity> = {}): ActingFarmer {
  return {
    id: 1,
    fsm: { current: "ACT" },
    transform: { x: 0, y: 0, prevX: 0, prevY: 0, rotation: 0 },
    intentions: { queue: [] },
    inventory: {
      gold: 0,
      crops: {} as never,
      seeds: {} as never,
      fish: zeroFish(),
      tools: [{ kind: "fishing-rod", tier: "wooden", durability: Infinity }],
    },
    farmer: { name: "Tester", currentRegion: "fishing-isle" },
    ...over,
  } as ActingFarmer;
}

describe("coral act handlers", () => {
  const dock = CORAL_REEFS[0]!.dock;
  const reef = CORAL_REEFS[0]!.reef;

  it("board-boat sets aboard only when standing on a dock", () => {
    const onDock = makeFarmer({ transform: { x: dock.x, y: dock.y, prevX: dock.x, prevY: dock.y, rotation: 0 } });
    handleBoardBoat(onDock);
    expect(onDock.farmer!.aboard).toBe(true);

    const offDock = makeFarmer({ transform: { x: 10, y: 10, prevX: 10, prevY: 10, rotation: 0 } });
    handleBoardBoat(offDock);
    expect(offDock.farmer!.aboard).toBeUndefined();
  });

  it("board/disembark also work at a port dock (port network)", () => {
    const portDock = PORTS[0]!.dock;
    const at = makeFarmer({ transform: { x: portDock.x, y: portDock.y, prevX: portDock.x, prevY: portDock.y, rotation: 0 } });
    handleBoardBoat(at);
    expect(at.farmer!.aboard).toBe(true);
    handleReturnToShore(at);
    expect(at.farmer!.aboard).toBe(false);
  });

  it("fish-coral lands a special fish + banks its premium gold when aboard at the reef", () => {
    const f = makeFarmer({
      transform: { x: reef.x, y: reef.y, prevX: reef.x, prevY: reef.y, rotation: 0 },
      farmer: { name: "T", currentRegion: "fishing-isle", aboard: true },
    });
    const rng = createRng(0xc0ffee).fork("fish");
    handleFishCoral(f, 100, rng);
    const fish = f.inventory.fish!;
    expect(fish["coral-trout"] + fish.lobster).toBe(1); 
    expect(fish.minnow + fish.bass + fish.salmon).toBe(0);
    const expectedKind = fish.lobster === 1 ? "lobster" : "coral-trout";
    expect(f.inventory.gold).toBe(FISH_VALUE[expectedKind]);
    expect(f.skills!.fishing).toBeGreaterThan(0);
    expect(f.farmer!.busyUntilTick).toBeGreaterThan(100);
  });

  it("fish-coral no-ops when NOT aboard or not on a reef", () => {

    const notReef = makeFarmer({
      transform: { x: dock.x, y: dock.y, prevX: dock.x, prevY: dock.y, rotation: 0 },
      farmer: { name: "T", currentRegion: "fishing-isle", aboard: true },
    });
    handleFishCoral(notReef, 100, createRng(1).fork("fish"));
    expect(notReef.inventory.gold).toBe(0);

    const notAboard = makeFarmer({
      transform: { x: reef.x, y: reef.y, prevX: reef.x, prevY: reef.y, rotation: 0 },
    });
    handleFishCoral(notAboard, 100, createRng(1).fork("fish"));
    expect(notAboard.inventory.gold).toBe(0);
  });

  it("broadcasts a feed message only for the jackpot lobster", () => {
    let sawLobsterBroadcast = false;
    let sawTroutNoBroadcast = false;
    for (let seed = 0; seed < 40 && !(sawLobsterBroadcast && sawTroutNoBroadcast); seed++) {
      const bus = new MessageBus();
      let sent = 0;
      const origSend = bus.send.bind(bus);
      bus.send = ((msg: Parameters<typeof origSend>[0], tick: number) => {
        sent++;
        return origSend(msg, tick);
      }) as typeof bus.send;
      const f = makeFarmer({
        transform: { x: reef.x, y: reef.y, prevX: reef.x, prevY: reef.y, rotation: 0 },
        farmer: { name: "T", currentRegion: "fishing-isle", aboard: true },
      });
      handleFishCoral(f, 100, createRng(seed).fork("fish"), bus);
      if (f.inventory.fish!.lobster === 1) {
        expect(sent).toBe(1);
        sawLobsterBroadcast = true;
      } else {
        expect(sent).toBe(0);
        sawTroutNoBroadcast = true;
      }
    }
    expect(sawLobsterBroadcast).toBe(true);
    expect(sawTroutNoBroadcast).toBe(true);
  });

  it("return-to-shore clears aboard only when back at a dock", () => {
    const atDock = makeFarmer({
      transform: { x: dock.x, y: dock.y, prevX: dock.x, prevY: dock.y, rotation: 0 },
      farmer: { name: "T", currentRegion: "fishing-isle", aboard: true },
    });
    handleReturnToShore(atDock);
    expect(atDock.farmer!.aboard).toBe(false);

    const midWater = makeFarmer({
      transform: { x: reef.x, y: reef.y, prevX: reef.x, prevY: reef.y, rotation: 0 },
      farmer: { name: "T", currentRegion: "fishing-isle", aboard: true },
    });
    handleReturnToShore(midWater);
    expect(midWater.farmer!.aboard).toBe(true);
  });
});
