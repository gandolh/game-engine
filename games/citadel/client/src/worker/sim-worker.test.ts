/**
 * Citadel 97/13 — the solo sim Worker emits AUTHORITATIVE pacing on every snapshot.
 *
 * The Worker owns `paused`/`speed` for the solo path (no server); it must stamp them — plus
 * `isHost: true` (solo is trivially host) — onto each snapshot so the client rederives them
 * instead of keeping optimistic local shadow state. It must also emit a fresh snapshot the
 * moment pacing changes (pause/resume/speed/load) — while paused the tick loop emits nothing,
 * so without an immediate emit a pause/resume would never reach the main thread, and a
 * load-save would leave the client's `paused` stuck (pinning render interpolation).
 *
 * We drive the module directly: `self.onmessage` is the Worker's handler (assigned at import);
 * `self.postMessage` is mocked to capture outbound. Fake timers keep the 50ms loop from firing,
 * so we only observe the SYNCHRONOUS emits the pacing handlers make.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { WorkerInbound, WorkerOutbound, RenderSnapshot, CitadelSave } from "@citadel/sim-core/snapshot";

const posted: WorkerOutbound[] = [];
let dispatch: (msg: WorkerInbound) => void;

function lastSnapshot(): RenderSnapshot | undefined {
  for (let i = posted.length - 1; i >= 0; i--) {
    const m = posted[i]!;
    if (m.type === "snapshot") return m.snapshot;
  }
  return undefined;
}

beforeAll(async () => {
  vi.useFakeTimers();
  // Mock postMessage BEFORE the handler runs (the module wires self.onmessage at import; the
  // first postMessage happens later, inside a dispatched handler).
  self.postMessage = ((m: WorkerOutbound) => { posted.push(m); }) as typeof self.postMessage;
  await import("./sim-worker");
  const handler = self.onmessage as unknown as (e: { data: WorkerInbound }) => void;
  dispatch = (msg) => handler({ data: msg });
});

afterAll(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("sim-worker — authoritative pacing on the snapshot", () => {
  it("stamps isHost/speed/paused, and self-corrects immediately on pause/resume/speed/load", () => {
    dispatch({ type: "init", seed: 1, ticksPerDay: 20 });

    // pause → immediate paused=true snapshot (the loop would emit nothing while paused).
    dispatch({ type: "pause" });
    const paused = lastSnapshot();
    expect(paused?.paused).toBe(true);
    expect(paused?.isHost).toBe(true); // solo is trivially host
    expect(paused?.speed).toBe(1);

    // resume → immediate paused=false snapshot.
    dispatch({ type: "resume" });
    expect(lastSnapshot()?.paused).toBe(false);

    // speed → the new multiplier rides the snapshot (not a ticks/sec figure).
    dispatch({ type: "speed", multiplier: 4 });
    expect(lastSnapshot()?.speed).toBe(4);

    // A load-save self-corrects: even after pausing pre-load, the post-load snapshot reports
    // paused=false so the client's interpolation resumes (no snap).
    dispatch({ type: "pause" });
    expect(lastSnapshot()?.paused).toBe(true);
    dispatch({ type: "request-save" });
    const saveMsg = posted.find((m): m is Extract<WorkerOutbound, { type: "save-data" }> => m.type === "save-data");
    expect(saveMsg).toBeDefined();
    const save: CitadelSave = saveMsg!.save;
    dispatch({ type: "load-save", save });
    expect(lastSnapshot()?.paused).toBe(false);
  });
});

/** Non-road structures in a snapshot's buildings list (the seeded core's road spine — 12 tiles
 *  — is itself carried as `type: "road"` entries in `buildings`, so a bare length check would
 *  count pavement as a building; filter it out to compare the actual structure count). */
function nonRoadTypes(snap: RenderSnapshot | undefined): string[] {
  return (snap?.buildings ?? []).filter((b) => b.type !== "road").map((b) => b.type);
}

describe("sim-worker — mode→flags mapping (brief 103 scope 1)", () => {
  // The worker never exposes bootstrap options directly, so we read the mapping through an
  // observable side effect: `seedTown` decides whether the world opens with the seeded alive
  // core (farm/mill/bakery/house/storehouse + a road spine) or empty, and that core is placed
  // synchronously at bootstrap (before any tick) — so a snapshot taken right after `init`
  // (forced via `pause`, which is a synchronous no-tick postSnapshot) already reflects it.
  it("mode:'challenge' bootstraps an empty map (seedTown:false) — no seeded core", () => {
    dispatch({ type: "init", seed: 7, ticksPerDay: 20, mode: "challenge" });
    dispatch({ type: "pause" }); // synchronous snapshot, no ticks advanced
    const snap = lastSnapshot();
    expect(snap?.buildings.length).toBe(0);
  });

  it("mode:'cozy' bootstraps the seeded alive core (seedTown:true) — 5 structures, no tick needed", () => {
    dispatch({ type: "init", seed: 7, ticksPerDay: 20, mode: "cozy" });
    dispatch({ type: "pause" });
    const snap = lastSnapshot();
    const structures = nonRoadTypes(snap);
    expect(structures.length).toBe(5);
    const types = new Set(structures);
    for (const t of ["farm", "mill", "bakery", "house", "storehouse"]) {
      expect(types.has(t)).toBe(true);
    }
  });

  it("omitting mode defaults to cozy (seeded), matching mode:'cozy' — not challenge's empty map", () => {
    dispatch({ type: "init", seed: 7, ticksPerDay: 20 });
    dispatch({ type: "pause" });
    expect(nonRoadTypes(lastSnapshot()).length).toBe(5);
  });
});
