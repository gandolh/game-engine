import { describe, it, expect } from "vitest";
import {
  instanceAABB,
  boundsOf,
  multiply,
  translation,
  rotationZ,
  scaling,
  box,
  translate,
} from "@engine/core/render3d";
import type { Mesh } from "@engine/core/render3d";
import { Profiler } from "@engine/core";
import type { HollowCommunitySnapshot, HollowSnapshot } from "@hollow/sim-core/sim-bootstrap";
import { StaticMeshes } from "./static-draws";
import { cachedInstanceAABB } from "./agent-bounds";
import { territoryMaterialKey } from "./materials";
import { groundHeightAt } from "./terrain";
import { buildGroundMesh, TERRITORY_TINT_Z_OFFSET } from "./world-meshes";
import { buildHearthMesh } from "./hearth-mesh";
import { homeMeshFor, type HouseholdPosition } from "./household-layout";

function community(id: number, territory: { gx: number; gy: number }[]): HollowCommunitySnapshot {
  return { id, members: [], territory, stockpile: {}, norms: { shareRate: 0, cooperationExpectation: 0 } };
}

function snapshot(
  communities: HollowCommunitySnapshot[],
  features: Pick<HollowSnapshot, "hearth" | "graveyard"> = { hearth: { gx: 10, gy: 12 }, graveyard: { gx: 3, gy: 4 } },
): HollowSnapshot {
  return {
    tick: 0,
    aliveCount: 0,
    agents: [],
    resourceNodes: [],
    communities,
    bornCount: 0,
    diedCount: 0,
    householdCount: 0,
    socialCounts: {},
    ...features,
  };
}

/** A fake renderer: each upload is a numbered handle, and the log records uploads and releases in order. */
function harness(): {
  meshes: StaticMeshes<number>;
  uploaded: Mesh[];
  log: string[];
  profiler: Profiler;
} {
  const uploaded: Mesh[] = [];
  const log: string[] = [];
  const profiler = new Profiler({ enabled: true });
  const meshes = new StaticMeshes<number>(
    (mesh) => {
      uploaded.push(mesh);
      log.push(`upload ${uploaded.length - 1}`);
      return uploaded.length - 1;
    },
    (handle) => log.push(`release ${handle}`),
    profiler,
    GROUND,
  );
  return { meshes, uploaded, log, profiler };
}

const GROUND = buildGroundMesh(4);
const first = { gx: 1, gy: 2 };
const tiles = [first, { gx: 3, gy: 4 }];
const uploadedAt = (uploaded: Mesh[], i: number): Mesh => {
  const mesh = uploaded[i];
  if (mesh === undefined) throw new Error(`no upload ${i}`);
  return mesh;
};
const homes = (entries: [number, HouseholdPosition][]): Map<number, HouseholdPosition> => new Map(entries);
const counts = (entries: [number, number][]): Map<number, number> => new Map(entries);

describe("StaticMeshes", () => {
  it("builds each mesh once for two frames on one snapshot", () => {
    const { meshes, uploaded } = harness();
    const snap = snapshot([community(1, tiles)]);
    const h = homes([[7, { x: 5.5, y: 6.25 }]]);
    const c = counts([[7, 2]]);
    meshes.update(snap, h, c);
    const fixed = meshes.fixedDraw;
    const changing = meshes.changingDraw;
    meshes.update(snap, h, c);
    expect(meshes.fixedBuilds).toBe(1);
    expect(meshes.changingBuilds).toBe(1);
    expect(uploaded).toHaveLength(2);
    expect(meshes.fixedDraw).toBe(fixed);
    expect(meshes.changingDraw).toBe(changing);
    expect(changing?.instanceCount).toBe(1);
  });

  it("builds once across new snapshot and map objects with the same content", () => {
    const { meshes } = harness();
    meshes.update(snapshot([community(1, tiles)]), homes([[7, { x: 5.5, y: 6.25 }]]), counts([[7, 2]]));
    meshes.update(
      snapshot([
        community(
          1,
          tiles.map((t) => ({ ...t })),
        ),
      ]),
      homes([[7, { x: 5.5, y: 6.25 }]]),
      counts([[7, 2]]),
    );
    expect(meshes.fixedBuilds).toBe(1);
    expect(meshes.changingBuilds).toBe(1);
  });

  it("rebuilds only the changing mesh when a tile, a tile count or a community id changes", () => {
    const { meshes } = harness();
    const none = homes([]);
    const noCounts = counts([]);
    meshes.update(snapshot([community(1, tiles)]), none, noCounts);
    meshes.update(snapshot([community(1, [first, { gx: 3, gy: 5 }])]), none, noCounts);
    expect(meshes.changingBuilds).toBe(2);
    meshes.update(snapshot([community(1, [first])]), none, noCounts);
    expect(meshes.changingBuilds).toBe(3);
    meshes.update(snapshot([community(2, [first])]), none, noCounts);
    expect(meshes.changingBuilds).toBe(4);
    expect(meshes.fixedBuilds).toBe(1);
  });

  it("rebuilds only the changing mesh when a household comes or goes, moves or changes size", () => {
    const { meshes } = harness();
    const snap = snapshot([community(1, tiles)]);
    meshes.update(snap, homes([[7, { x: 5.5, y: 6.25 }]]), counts([[7, 2]]));
    meshes.update(
      snap,
      homes([
        [7, { x: 5.5, y: 6.25 }],
        [8, { x: 9, y: 9 }],
      ]),
      counts([
        [7, 2],
        [8, 1],
      ]),
    );
    expect(meshes.changingBuilds).toBe(2);
    meshes.update(snap, homes([[7, { x: 5.5, y: 6.25 }]]), counts([[7, 3]]));
    expect(meshes.changingBuilds).toBe(3);
    meshes.update(snap, homes([[7, { x: 5.5, y: 6.25 }]]), counts([[7, 4]]));
    expect(meshes.changingBuilds).toBe(4);
    meshes.update(snap, homes([[7, { x: 5.5, y: 6.5 }]]), counts([[7, 4]]));
    expect(meshes.changingBuilds).toBe(5);
    meshes.update(snap, homes([[9, { x: 5.5, y: 6.5 }]]), counts([[9, 4]]));
    expect(meshes.changingBuilds).toBe(6);
    expect(meshes.fixedBuilds).toBe(1);
  });

  it("rebuilds only the fixed mesh when the hearth moves or the graveyard appears", () => {
    const { meshes } = harness();
    const territory = [community(1, tiles)];
    meshes.update(snapshot(territory, { hearth: { gx: 10, gy: 12 } }), homes([]), counts([]));
    meshes.update(snapshot(territory, { hearth: { gx: 11, gy: 12 } }), homes([]), counts([]));
    expect(meshes.fixedBuilds).toBe(2);
    meshes.update(
      snapshot(territory, { hearth: { gx: 11, gy: 12 }, graveyard: { gx: 0, gy: 0 } }),
      homes([]),
      counts([]),
    );
    expect(meshes.fixedBuilds).toBe(3);
    meshes.update(
      snapshot(territory, { hearth: { gx: 11, gy: 12 }, graveyard: { gx: 0, gy: 0 } }),
      homes([]),
      counts([]),
    );
    expect(meshes.fixedBuilds).toBe(3);
    expect(meshes.changingBuilds).toBe(1);
  });

  it("uploads the new mesh before it releases the old one, and draws the new one", () => {
    const { meshes, log } = harness();
    meshes.update(snapshot([community(1, tiles)]), homes([]), counts([]));
    expect(log).toEqual(["upload 0", "upload 1"]);
    meshes.update(snapshot([community(1, [first])]), homes([]), counts([]));
    expect(log).toEqual(["upload 0", "upload 1", "upload 2", "release 1"]);
    expect(meshes.changingDraw?.mesh).toBe(2);
    meshes.update(snapshot([community(1, [first])], { hearth: { gx: 1, gy: 1 } }), homes([]), counts([]));
    expect(log.slice(4)).toEqual(["upload 3", "release 0"]);
    expect(meshes.fixedDraw?.mesh).toBe(3);
  });

  it("draws no changing mesh while there is no territory and no home, and releases the last one", () => {
    const { meshes, log } = harness();
    meshes.update(snapshot([community(1, [])]), homes([]), counts([]));
    expect(meshes.changingDraw).toBeNull();
    meshes.update(snapshot([community(1, tiles)]), homes([]), counts([]));
    expect(meshes.changingDraw?.mesh).toBe(1);
    meshes.update(snapshot([community(1, [])]), homes([]), counts([]));
    expect(meshes.changingDraw).toBeNull();
    expect(log.at(-1)).toBe("release 1");
  });

  it("places tiles and homes where the per-instance draws did, each tile in its community's material", () => {
    const { meshes, uploaded } = harness();
    const pos = { x: 5.5, y: 6.25 };
    meshes.update(
      snapshot([community(3, tiles), community(1, [{ gx: 9, gy: 9 }])]),
      homes([[7, pos]]),
      counts([[7, 3]]),
    );
    const changing = uploadedAt(uploaded, 1);
    const tileCorners = (gx: number, gy: number): number[][] => {
      const z = groundHeightAt(gx, gy) + TERRITORY_TINT_Z_OFFSET;
      return [
        [gx, gy, z],
        [gx + 1, gy, z],
        [gx + 1, gy + 1, z],
        [gx, gy + 1, z],
      ];
    };
    const home = translate(homeMeshFor(3), [pos.x, pos.y, groundHeightAt(6, 6)]);
    expect(changing.positions).toEqual([
      ...tileCorners(1, 2),
      ...tileCorners(3, 4),
      ...tileCorners(9, 9),
      ...home.positions,
    ]);
    expect(changing.tris.slice(0, 4).every((t) => t.material === territoryMaterialKey(3))).toBe(true);
    expect(changing.tris.slice(4, 6).every((t) => t.material === territoryMaterialKey(1))).toBe(true);
    expect(changing.tris.slice(6).map((t) => t.material)).toEqual(homeMeshFor(3).tris.map((t) => t.material));
  });

  it("puts the ground first, then the hearth and graveyard at their tile centres", () => {
    const { meshes, uploaded } = harness();
    meshes.update(snapshot([]), homes([]), counts([]));
    const fixed = uploadedAt(uploaded, 0);
    expect(fixed.positions.slice(0, GROUND.positions.length)).toEqual(GROUND.positions);
    const hearth = translate(buildHearthMesh(), [10.5, 12.5, groundHeightAt(10, 12)]);
    expect(fixed.positions.slice(GROUND.positions.length, GROUND.positions.length + hearth.positions.length)).toEqual(
      hearth.positions,
    );
    expect(boundsOf(fixed).max[0]).toBeGreaterThanOrEqual(4);
  });

  it("times every build as static.merge", () => {
    const { meshes, profiler } = harness();
    meshes.update(snapshot([community(1, tiles)]), homes([]), counts([]));
    meshes.update(snapshot([community(1, tiles)]), homes([]), counts([]));
    meshes.update(snapshot([community(2, tiles)]), homes([]), counts([]));
    expect(profiler.stats("static.merge")?.count).toBe(3);
  });
});

describe("cachedInstanceAABB", () => {
  it("equals instanceAABB for a rotated, scaled, translated mesh", () => {
    const mesh = box([1, 2, 3], "m");
    const model = multiply(translation([4, -1, 2]), multiply(rotationZ(0.7), scaling([1.2, 0.8, 1.5])));
    expect(cachedInstanceAABB(mesh, model)).toEqual(instanceAABB(mesh, model));
    expect(cachedInstanceAABB(mesh, model)).toEqual(instanceAABB(mesh, model));
    expect(boundsOf(mesh).max).toEqual([1, 2, 3]);
  });
});
