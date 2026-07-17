// Smoke test for @engine/core, installed from the npm-pack tarball (dist/, not src/).
//
// Exercises three subpaths: /ecs (World spawn/query/despawn), /runtime (seeded Rng +
// fork determinism), /sim (MessageBus send/flush/receive). API shapes verified against
// engine/core/src/{ecs/world.ts, runtime/rng.ts, sim/message-bus.ts}.

import assert from "node:assert/strict";
import { World } from "@engine/core/ecs";
import { createRng } from "@engine/core/runtime";
import { MessageBus } from "@engine/core/sim";

function smokeEcs() {
  const world = new World();
  const e = world.spawn({ transform: { x: 1, y: 2 } });
  assert.equal(typeof e.id, "number", "spawned entity should get an auto-assigned id");

  const q = world.query("transform");
  assert.equal(q.entities.length, 1, "query should find the spawned entity");
  assert.equal([...q][0].transform.x, 1);

  world.despawn(e);
  assert.equal(q.entities.length, 0, "query should drop the entity after despawn");

  console.log("[core/ecs] OK — spawn/query/despawn");
}

function smokeRuntime() {
  const a = createRng(123).fork("label");
  const seqA = [a.nextFloat(), a.nextFloat()];

  const b = createRng(123).fork("label");
  const seqB = [b.nextFloat(), b.nextFloat()];

  assert.deepEqual(seqA, seqB, "same seed + same fork label must reproduce the same sequence");
  assert.ok(seqA.every((v) => v >= 0 && v < 1), "nextFloat() must be in [0,1)");

  console.log("[core/runtime] OK — createRng(123).fork('label') deterministic:", seqA);
}

function smokeSim() {
  const bus = new MessageBus();
  bus.send(
    { performative: "inform", ontology: "test.ping", sender: "world", recipient: "broadcast", body: { hello: true } },
    0,
  );
  // Not yet visible — send() only queues inflight.
  assert.equal(bus.drain().length, 0, "messages are inflight until flush()");

  bus.flush();
  const delivered = bus.drain();
  assert.equal(delivered.length, 1, "flush() should promote inflight -> deliverable");
  assert.equal(delivered[0].ontology, "test.ping");

  let received;
  bus.subscribeOntology("test.ping", (msg) => {
    received = msg;
  });
  bus.notifySubscribers();
  assert.ok(received, "subscriber should receive the flushed message");
  assert.equal(received.body.hello, true);

  console.log("[core/sim] OK — send/flush/receive one message");
}

smokeEcs();
smokeRuntime();
smokeSim();
