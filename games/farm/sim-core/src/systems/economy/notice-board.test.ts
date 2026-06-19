import { describe, it, expect } from "vitest";
import { World, MessageBus, createRng } from "@engine/core";
import type { GameEntity } from "../../components";
import { NoticeBoardSystem } from "./notice-board";
import { ONT_SIMULATION } from "../../protocols";
import { ONT_BOUNTY, type BountyPostedBody } from "../../protocols/bounty";
import { PERFORMATIVE } from "../../protocols/performatives";

function makeBoard(world: World<GameEntity>): GameEntity {
  return world.spawn({
    noticeBoard: { isNoticeBoard: true },
    inbox: { messages: [] },
  });
}

function pushDayStart(board: GameEntity, day: number): void {
  board.inbox!.messages.push({
    performative: PERFORMATIVE.INFORM,
    ontology: ONT_SIMULATION.DAY_START,
    sender: "world",
    body: { day } as Record<string, unknown>,
    tickIssued: 0,
  });
}

describe("NoticeBoardSystem (daily demand line)", () => {
  it("stamps a daily demand line and broadcasts the bounty on a bounty day", () => {
    const world = new World<GameEntity>();
    const bus = new MessageBus();
    const board = makeBoard(world);
    let posted = false;
    for (let seed = 1; seed <= 8 && !posted; seed++) {
      const w = new World<GameEntity>();
      const b = w.spawn({ noticeBoard: { isNoticeBoard: true }, inbox: { messages: [] } });
      const sys = new NoticeBoardSystem(w, new MessageBus(), createRng(seed));
      pushDayStart(b, 1);
      sys.run({ tick: 20 } as never);
      const text = b.noticeBoard!.bountyText;
      expect(typeof text).toBe("string");
      if (text && text.startsWith("Wanted:")) posted = true;
    }
    expect(posted).toBe(true);

    const sys = new NoticeBoardSystem(world, bus, createRng(1));
    pushDayStart(board, 1);
    sys.run({ tick: 20 } as never);
    bus.flush();
    const sent = bus.drain().filter((m) => m.ontology === ONT_BOUNTY.POSTED);
    expect(sent.length).toBe(1);
    const body = sent[0]!.body as unknown as BountyPostedBody;
    expect("bounty" in body).toBe(true);
    expect(typeof board.noticeBoard!.bountyText).toBe("string");
  });
});
