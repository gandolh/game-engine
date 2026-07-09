import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../../sim-bootstrap";
import { JsPathfinder } from "../../world/js-pathfinder";

const TICKS_PER_DAY = 60;

// Every entity that carries an `inbox` but is NOT a farmer (no `beliefs`). These
// used to accumulate every broadcast forever because PerceiveSystem only clears
// farmer inboxes. A run with a real pathfinder produces a steady stream of
// broadcasts (DAY_START, PHASE_START, TRAVEL.ARRIVED, auction results, …), so an
// unbounded inbox would climb into the hundreds/thousands over a multi-day run.
function maxStationInbox(world: ReturnType<typeof bootstrapSim>["world"]): number {
  let maxLen = 0;
  for (const e of world.query("inbox")) {
    if (e.beliefs) continue; // farmer — owned by PerceiveSystem
    maxLen = Math.max(maxLen, e.inbox.messages.length);
  }
  return maxLen;
}

// Runs the sim and returns the PEAK non-farmer inbox length observed after any
// tick — sampling across the whole run, not just the final (cleared) state, so a
// mid-run leak cannot hide.
function peakStationInboxOverRun(seed: number, days: number): number {
  const sim = bootstrapSim({
    seed,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: days,
    pathfinder: new JsPathfinder(),
  });
  const totalTicks = days * TICKS_PER_DAY;
  let peak = 0;
  for (let tick = 0; tick < totalTicks; tick++) {
    sim.scheduler.tick({ tick });
    peak = Math.max(peak, maxStationInbox(sim.world));
  }
  return peak;
}

describe("StationInboxClearSystem — station inboxes stay bounded", () => {
  // A generous cap that is still tiny next to the cumulative broadcast volume of a
  // multi-day run. If the leak regressed, the peak would be in the hundreds+.
  const BOUND = 60;

  it("no non-farmer inbox grows unboundedly across a 30-day run", () => {
    expect(peakStationInboxOverRun(0xc0ffee, 30)).toBeLessThanOrEqual(BOUND);
  });

  it("peak inbox size does not scale with the number of days simulated", () => {
    const short = peakStationInboxOverRun(0xc0ffee, 10);
    const long = peakStationInboxOverRun(0xc0ffee, 40);
    // 4x the days would mean a ~4x larger peak if the arrays still accumulated.
    expect(long).toBeLessThanOrEqual(BOUND);
    expect(long).toBeLessThanOrEqual(short + 10);
  });

  it("the shopkeeper retains only a bounded number of pending auction results", () => {
    // Auctions fire every 5 days; without the settled-check drop every result
    // ever broadcast would linger here. Settled/no-winner results are pruned.
    const sim = bootstrapSim({
      seed: 42,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: 40,
      pathfinder: new JsPathfinder(),
    });
    let peakShop = 0;
    for (let tick = 0; tick < 40 * TICKS_PER_DAY; tick++) {
      sim.scheduler.tick({ tick });
      for (const e of sim.world.query("shopkeeper", "inbox")) {
        peakShop = Math.max(peakShop, e.inbox.messages.length);
      }
    }
    expect(peakShop).toBeLessThanOrEqual(BOUND);
  });
});

// Stage-placement guard (distinct from the "bounded size" tests above, which would
// still pass — even more trivially — if the clear ran too EARLY and emptied inboxes
// before their SNOOP-stage readers ever saw them). This asserts message VISIBILITY:
// a broadcast a station consumer depends on must actually be observed, not just
// "the array didn't grow". EventFeedSystem.snoopMarketWall reads the marketWall
// entity's inbox in the SNOOP stage, several systems after InboxDispatchSystem fills
// it in DISPATCH and several systems before StationInboxClearSystem drains it in
// CLEANUP; the shopkeeper triggers a golden-bean auction every few days (see
// AUCTION_RESULT above), which AuctionSystem broadcasts and EventFeedSystem captures
// into a durable "eventFeed" entry. If StationInboxClearSystem ran any earlier than
// CLEANUP — e.g. right after InboxDispatchSystem in DISPATCH, before SNOOP even
// starts — it would empty the marketWall inbox before EventFeedSystem ever reads it,
// and no auction event would ever reach the feed.
//
// Verified: temporarily moving the StationInboxClearSystem registration in
// sim-bootstrap.ts to right after `new InboxDispatchSystem(bus, world)` in the
// DISPATCH stage turns this test red (`eventFeed.recent()` stays empty for the whole
// run); moving it back to CLEANUP turns it green again.
describe("StationInboxClearSystem — stage placement (must run AFTER the SNOOP-stage consumers)", () => {
  it("EventFeedSystem observes a broadcast auction result before the end-of-tick clear drops it", () => {
    const sim = bootstrapSim({
      seed: 42,
      ticksPerDay: TICKS_PER_DAY,
      maxDays: 20,
      pathfinder: new JsPathfinder(),
    });
    for (let tick = 0; tick < 20 * TICKS_PER_DAY; tick++) {
      sim.scheduler.tick({ tick });
    }
    const auctionEvents = sim.eventFeed
      .recent()
      .filter((e) => /golden bean|Auction closed with no winner/.test(e.text));
    expect(auctionEvents.length).toBeGreaterThan(0);
  });
});
